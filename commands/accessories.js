const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// EtcOptions 캐싱
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

// 특정 세부 옵션의 EtcValues 반환
async function fetchEtcValues(apiBase, token, parentValue, subValue) {
  const options = await fetchEtcOptions(apiBase, token);
  const parent = options.find(o => o.Value === parentValue);
  const subs = parent ? parent.EtcSubs : [];
  const sub = subs.find(s => s.Value === subValue);
  return sub?.EtcValues || [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('악세')
    .setDescription('목걸이/귀걸이/반지 선택 후 시세 검색')
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
        .setDescription('거래 가능 횟수')
        .setRequired(true)
        .addChoices(
          { name: '전체', value: 'null' },
          { name: '0회',  value: '0' },
          { name: '1회',  value: '1' },
          { name: '2회',  value: '2' }
        )
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
      opt.setName('힘민지')
        .setDescription('장신구 기본 효과')
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

      // 카테고리 & 거래
      const categoryCode = Number(interaction.options.getString('종류'));
      const tradeRaw = interaction.options.getString('거래횟수');
      const tradeCount = tradeRaw === 'null' ? null : Number(tradeRaw);

      // 연마 효과 + 수치 옵션 파싱
      const effectsRaw = [];
      for (let i = 1; i <= 3; i++) {
        const raw = interaction.options.getString(`${i}연마효과`);
        if (raw) effectsRaw.push(raw);
      }

      // EtcOptions 구성
      const etcOptions = effectsRaw.map(raw => {
        const [subStr, valStr] = raw.split('_');
        return {
          FirstOption: 7,
          SecondOption: Number(subStr),
          MinValue: Number(valStr),
          MaxValue: Number(valStr)
        };
      });

      // 장신구 기본 효과
      const baseSub = interaction.options.getInteger('힘민지');
      const baseMin = interaction.options.getInteger('힘민지최소값');
      if (baseSub != null) {
        etcOptions.push({
          FirstOption: 1,
          SecondOption: baseSub,
          MinValue: baseMin ?? null,
          MaxValue: null
        });
      }

      // 요청 바디
      const body = {
        ItemLevelMin: 0,
        ItemLevelMax: 0,
        ItemGradeQuality: 70,
        ItemUpgradeLevel: null,
        ItemTradeAllowCount: tradeCount,
        SkillOptions: [],
        EtcOptions: etcOptions,
        Sort: 'BIDSTART_PRICE',
        SortCondition: 'ASC',
        CategoryCode: categoryCode,
        CharacterClass: '',
        ItemTier: 4,
        ItemGrade: "고대",
        ItemName: "",
        PageNo: 0,
        PageSize: 100
      };

      console.log('DEBUG [악세서리 검색]:', { effectsRaw, etcOptions, body });

      const { data } = await axios.post(
        `${apiBase}/auctions/items`,
        body,
        { headers: { accept: 'application/json', authorization: `Bearer ${token}` } }
      );

      const items = data.Items || [];
      const available = items.filter(i => i.AuctionInfo?.BuyPrice);
      if (!available.length) return interaction.editReply('🔍 조건에 맞는 매물이 없습니다.');
      const cheapest = available.reduce((a, b) => a.AuctionInfo.BuyPrice < b.AuctionInfo.BuyPrice ? a : b);

      const top3 = available
      .sort((a, b) => a.AuctionInfo.BuyPrice - b.AuctionInfo.BuyPrice)
      .slice(0, 3);
      const desc = top3.map(item => {
        // 연마효과만 추출 (ACCESSORY_UPGRADE)
        const upgrades = (item.Options || [])
          .filter(opt => opt.Type === 'ACCESSORY_UPGRADE')
          .map(opt => `${opt.OptionName} ${opt.Value}${opt.IsValuePercentage ? '%' : ''}`)
          .join('\n\t ') || '-';

        // 힘 옵션만 추출
        const power = (item.Options || []).find(opt => opt.OptionName === '힘');
        const powerValue = power ? `${power.Value}` : '-';
        //거래 가능 횟수 추출
        const tradeAllowCount = typeof item.AuctionInfo.TradeAllowCount === 'number' ? item.AuctionInfo.TradeAllowCount : '-';

        return [
          `아이템: ${item.Name ?? '–'}`,
          `\**즉시구매가**\: ${item.AuctionInfo.BuyPrice.toLocaleString()} 🪙`,
          `\**연마효과**\: ${upgrades}`,
          `\**힘/민/지**\: ${powerValue}`,
          `\**거래가능횟수**\: ${tradeAllowCount}`
        ].join('\n');
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('🔍 악세서리 검색 결과')
        .setDescription(desc)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('검색 오류:', err);
      await interaction.editReply('❗️ 오류 발생');
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
    const token = process.env.LOSTARK_REST_KEY;

    // 연마 효과 + 값 자동완성
    if (/^[123]연마효과$/.test(focused.name)) {
      const subs = (await fetchEtcOptions(apiBase, token))
        .find(o => o.Value === 7)?.EtcSubs || [];
      const combos = subs.flatMap(sub =>
        (sub.EtcValues || []).map(v => ({ name: `${sub.Text} ${v.DisplayValue}`, value: `${sub.Value}_${v.Value}`}))
      );

      const filtered = combos
        .filter(c => c.name.toLowerCase().startsWith(focused.value.toLowerCase()))
        .slice(0, 25);
      return interaction.respond(filtered);
    }

    // 장신구 기본 효과 자동완성
    if (focused.name === '힘민지') {
      const subs = (await fetchEtcOptions(apiBase, token))
        .find(o => o.Value === 1)?.EtcSubs || [];
      const filtered = subs
        .filter(s => s.Text.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map(s => ({ name: s.Text, value: s.Value }));
      return interaction.respond(filtered);
    }

    return interaction.respond([]);
  }
};
