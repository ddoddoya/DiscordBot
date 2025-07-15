// commands/account.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios                   = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('원정대')                    
    .setDescription('계정 내 모든 캐릭터 전투력·아이템레벨 조회')
    .addStringOption(opt =>
      opt
        .setName('name')
        .setNameLocalizations({ ko: '이름' })
        .setDescription('조회할 대표 캐릭터 이름')
        .setRequired(true)
    ),

  async execute(interaction) {
    const repName = interaction.options.getString('name');
    await interaction.deferReply();

    try {
      // 1) siblings 호출: 같은 계정 전체 캐릭터 목록
      const sibRes = await axios.get(
        `https://developer-lostark.game.onstove.com/characters/${encodeURIComponent(repName)}/siblings`,
        { headers: { Authorization: `Bearer ${process.env.LOSTARK_REST_KEY}` } }
      );
      const chars = sibRes.data; // [{ CharacterName, CharacterClassName, ... }, …]

      // 2) 각 캐릭터별 armory 호출 (병렬)
        const stats = await Promise.all(
        chars.map(c =>
            axios
            .get(
                `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(c.CharacterName)}/profiles`,
                { headers: { Authorization: `Bearer ${process.env.LOSTARK_REST_KEY}` } }
            )
            .then(r => r.data)
            .catch(() => null)
        )
        );
        console.log('🔍 API 응답 확인:', JSON.stringify(stats, null, 2));
      // 3) Embed 조립
    const embed = new EmbedBuilder()
    .setTitle(`${repName} 님 계정 상위 6개 캐릭터 정보`)
    .setColor(0x00AE86)
    .setFooter({ text: 'Data from LostArk API' });

    // 3-1) chars 와 stats 를 묶어서 avg 계산
    const paired = chars.map((c, i) => {
    const d = stats[i];
    // ItemAvgLevel 은 쉼표 제거 후 숫자로
    const rawAvg = d?.ItemAvgLevel ?? '';
    const avgNum = parseFloat(rawAvg.replace(/,/g, '')) || 0;
    return { c, d, avg: avgNum };
    });

    // 3-2) 프로필이 있는 항목만, avg 내림차순 정렬 후 상위 6개 추출
    const top6 = paired
    .filter(x => x.d)              // null 응답 제외
    .sort((a, b) => b.avg - a.avg) // 아이템 레벨 내림차순
    .slice(0, 6);                  // 상위 6개

    // 3-3) 상위 6개만 Embed 필드로 추가
    top6.forEach(({ c, d, avg }) => {
    const rawCp = d.CombatPower ?? '';
    const cpNum = parseFloat(rawCp.replace(/,/g, '')) || 0;

    embed.addFields({
        name: `${c.CharacterName} (${c.CharacterClassName})`,
        value:
        `📦 아이템 레벨: **${avg.toFixed(2)}**\n` +
        `⚔️ 전투력: **${cpNum.toLocaleString()}**`,
        inline: false
    });
    });

    await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err.response?.status, err.response?.data || err);
      await interaction.editReply(
        '⚠️ 계정 전체 캐릭터 정보를 불러오는 중 오류가 발생했습니다.'
      );
    }
  }
};
