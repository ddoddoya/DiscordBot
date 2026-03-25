require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const pool = require('../database');


// 로스트아크 API EtcOptions 캐싱 (API 호출 낭비 방지)
let cachedEtcOptions = null;
async function fetchEtcOptions(apiBase, token) {
  if (cachedEtcOptions) return cachedEtcOptions;
  const res = await axios.get(
    `${apiBase}/auctions/options`,
    { headers: { accept: 'application/json', authorization: `Bearer ${token}` } }
  );
  cachedEtcOptions = res.data.EtcOptions;
  return cachedEtcOptions;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('악세알림')
    .setDescription('원하는 악세서리의 목표 금액을 설정하고 알림을 받습니다.')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('악세서리 종류')
        .setRequired(true)
        .addChoices(
          { name: '목걸이', value: '200010' },
          { name: '귀걸이', value: '200020' },
          { name: '반지',   value: '200030' }
        )
    )
    .addStringOption(opt =>
      opt.setName('거래횟수')
        .setDescription('최소 거래 가능 횟수')
        .setRequired(true)
        .addChoices(
          { name: '전체',     value: 'null' },
          { name: '0회 이상', value: '0' },
          { name: '1회 이상', value: '1' },
          { name: '2회 이상', value: '2' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('목표금액')
        .setDescription('알림을 받을 최대 즉시구매가 (이 금액 이하일 때 알림)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('1연마효과')
        .setDescription('연마 효과 1 + 수치 선택')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('2연마효과')
        .setDescription('연마 효과 2 + 수치 선택')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('3연마효과')
        .setDescription('연마 효과 3 + 수치 선택')
        .setRequired(false)
        .setAutocomplete(true)
    )

    .addIntegerOption(opt =>
      opt.setName('힘민지최소값')
        .setDescription('장신구 기본 효과 최소값')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
      const token = process.env.LOSTARK_REST_KEY;

      // 1. 유저 입력값 가져오기
      const targetPrice = interaction.options.getInteger('목표금액');
      const categoryCode = Number(interaction.options.getString('종류'));
      const tradeRaw = interaction.options.getString('거래횟수');
      const minTradeCount = tradeRaw === 'null' ? null : Number(tradeRaw);

      // 연마 효과 입력값 배열화
      const effectsRaw = [];
      for (let i = 1; i <= 3; i++) {
        const raw = interaction.options.getString(`${i}연마효과`);
        if (raw) effectsRaw.push(raw);
      }

      // 옵션 코드를 한글로 변환하기 위해 캐시된 옵션 데이터 로드
      const optionsData = await fetchEtcOptions(apiBase, token);
      const upgradeSubs = optionsData.find(o => o.Value === 7)?.EtcSubs || [];
      const statSubs = optionsData.find(o => o.Value === 1)?.EtcSubs || [];

      const displayNames = [];

      // 2. 연마 효과 파싱 및 한글명 추출
      const etcOptions = effectsRaw.map(raw => {
        const [subStr, valStr] = raw.split('_');
        
        const subOpt = upgradeSubs.find(s => s.Value === Number(subStr));
        if (subOpt) {
            const valOpt = (subOpt.EtcValues || []).find(v => v.Value === Number(valStr));
            const displayVal = valOpt ? valOpt.DisplayValue : valStr;
            displayNames.push(`- ${subOpt.Text} ${displayVal}`);
        }

        return {
          FirstOption: 7,
          SecondOption: Number(subStr),
          MinValue: Number(valStr),
          MaxValue: Number(valStr)
        };
      });

      // 3. 장신구 기본 효과(힘/민/지) 파싱
      const baseMin = interaction.options.getInteger('힘민지최소값');

      // 유저가 최소값을 입력했다면 무조건 '힘 / 민첩 / 지능'으로 자동 매칭
      if (baseMin != null) {
        const autoStat = statSubs.find(s => s.Text.includes('힘') || s.Text.includes('민첩'));
        
        if (autoStat) {
            etcOptions.push({
              FirstOption: 1,
              SecondOption: autoStat.Value,
              MinValue: baseMin,
              MaxValue: null
            });
            displayNames.push(`- ${autoStat.Text} (최소 ${baseMin})`);
        } else {
            // API에서 값을 못 찾았을 경우의 예외 처리
            displayNames.push(`- 기본효과 (최소 ${baseMin})`);
        }
      }

      // 4. 로스트아크 API에 보낼 검색 조건 바디 생성
      const body = {
        ItemLevelMin: 0,
        ItemLevelMax: 0,
        ItemGradeQuality: 70, 
        ItemUpgradeLevel: null,
        ItemTradeAllowCount: null, // 팩트: API는 전체 검색, 필터링은 봇 스케줄러가 담당
        Bot_MinTradeCount: minTradeCount, // 봇 필터링용 커스텀 데이터
        SkillOptions: [],
        EtcOptions: etcOptions,
        Sort: 'BUY_PRICE', // 즉시구매가 오름차순
        SortCondition: 'ASC',
        CategoryCode: categoryCode,
        CharacterClass: '',
        ItemTier: 4,
        ItemGrade: "고대",
        ItemName: "",
        PageNo: 0,
        PageSize: 10
      };

      // 5. 생성한 테이블(auction_alerts)에 데이터 INSERT
      const insertQuery = `
        INSERT INTO auction_alerts (user_id, channel_id, target_price, search_body, notified_keys)
        VALUES (?, ?, ?, ?, '[]')
      `;
      
      await pool.execute(insertQuery, [
        interaction.user.id,
        interaction.channelId,
        targetPrice,
        JSON.stringify(body)
      ]);

      // 6. 디스코드 응답 임베드 구성
      const optionsText = displayNames.length > 0 ? displayNames.join('\n') : '선택한 추가 옵션 없음';
      const categoryName = categoryCode === 200010 ? '목걸이' : categoryCode === 200020 ? '귀걸이' : '반지';

      const embed = new EmbedBuilder()
        .setTitle('✅ 경매장 알림 등록 완료')
        .setColor('Green')
        .setDescription('해당 조건의 매물이 올라오면 봇이 즉시 멘션해 드립니다.')
        .addFields(
          { name: '부위', value: categoryName, inline: true },
          { name: '목표 금액', value: `${targetPrice.toLocaleString()} 골드 이하`, inline: true },
          { name: '거래 횟수', value: tradeRaw === 'null' ? '전체' : `${tradeRaw}회 이상`, inline: true },
          { name: '세부 옵션', value: optionsText, inline: false }
        )
        .setFooter({ text: '1분 주기로 감시하며, 로스트아크 정기 점검 중에는 발송되지 않습니다.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('알림 등록 명령어 실행 오류:', err);
      await interaction.editReply('❗️ 데이터베이스 저장 중 오류가 발생했습니다.');
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
    const token = process.env.LOSTARK_REST_KEY;

    try {
      // 연마 효과 + 값 자동완성
      if (/^[123]연마효과$/.test(focused.name)) {
        const subs = (await fetchEtcOptions(apiBase, token))
          .find(o => o.Value === 7)?.EtcSubs || [];
        const combos = subs.flatMap(sub =>
          (sub.EtcValues || []).map(v => ({ name: `${sub.Text} ${v.DisplayValue}`, value: `${sub.Value}_${v.Value}`}))
        );

        const filtered = combos
          .filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25);
        return interaction.respond(filtered);
      }

    } catch (error) {
      console.error('자동완성 오류:', error);
      return interaction.respond([]);
    }

    return interaction.respond([]);
  }
};