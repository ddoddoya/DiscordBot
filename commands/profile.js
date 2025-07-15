// commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('캐릭터프로필')
    .setDescription('캐릭터의 아이템 레벨과 전투력만 조회합니다.')
    .addStringOption(opt =>
      opt
        .setName('name')
        .setDescription('조회할 캐릭터 이름')
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    await interaction.deferReply();

    try {
      // profiles 엔드포인트만 호출
      const res = await axios.get(
        `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}/profiles`,
        {
          headers: {
            Authorization: `Bearer ${process.env.LOSTARK_REST_KEY}`,
            Accept:        'application/json'
          }
        }
      );
      const d = res.data;

      // 문자열에 포함된 쉼표 제거 후 숫자로 파싱
      const avgLevel = parseFloat((d.ItemAvgLevel   ?? '').replace(/,/g, '')) || 0;
      const combatP  = parseFloat((d.CombatPower     ?? '').replace(/,/g, ''))  || 0;

      // Embed 조립
      const embed = new EmbedBuilder()
        .setTitle(`${d.CharacterName} 님의 스탯`)
        .setColor(0x00AE86)
        .addFields(
          {
            name: `${d.CharacterName} (${d.CharacterClassName})`,
            value:
            `📦 아이템 레벨: **${avgLevel.toFixed(2)}**\n` +
            `⚔️ 전투력: **${combatP.toLocaleString()}**`,
            inline: false
          }
        )
        .setFooter({ text: 'Data from LostArk API' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err.response?.status, err.response?.data || err);
      await interaction.editReply('⚠️ 캐릭터 정보를 불러오는 중 오류가 발생했습니다. 이름을 다시 확인해주세요.');
    }
  }
};
