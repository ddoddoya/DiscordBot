const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('보석')
    .setDescription('보석 아이템의 최저 즉시 구매가를 알려줍니다'),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
      const token = process.env.LOSTARK_API_TOKEN;
      const categoryCode = 210000; // 보석 카테고리 코드로 고정
      const itemNames = [
        '10레벨 겁화의 보석',
        '10레벨 작열의 보석',
        '9레벨 겁화의 보석',
        '9레벨 작열의 보석',
        '8레벨 겁화의 보석',
        '8레벨 작열의 보석'
      ];

      const results = [];
      for (const ItemName of itemNames) {
        const response = await axios.post(
          `${apiBase}/auctions/items`,
          {
            ItemLevelMin: 0,
            ItemLevelMax: 0,
            ItemGradeQuality: null,
            ItemUpgradeLevel: null,
            ItemTradeAllowCount: null,
            SkillOptions: [],
            EtcOptions: [],
            Sort: 'BIDSTART_PRICE',
            SortCondition: 'ASC',
            CategoryCode: categoryCode,
            CharacterClass: '',
            ItemTier: null,
            ItemGrade: '',
            ItemName,
            PageNo: 0,
            PageSize: 100
          },
          {
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${process.env.LOSTARK_REST_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const items = response.data.Items || [];
        const available = items.filter(i => i.AuctionInfo && i.AuctionInfo.BuyPrice);
        if (available.length > 0) {
          const cheapest = available.reduce((prev, curr) =>
            prev.AuctionInfo.BuyPrice < curr.AuctionInfo.BuyPrice ? prev : curr
          );
          results.push({ name: ItemName, price: cheapest.AuctionInfo.BuyPrice });
        } else {
          results.push({ name: ItemName, price: null });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('💎 보석 경매장 최저가')
        .setTimestamp();

      let description = '';
      for (const r of results) {
        const text = r.price !== null ? `${r.price.toLocaleString()} 🪙` : '매물 없음';
        description += `💎 **${r.name}**: ${text}\n`;
      }
      embed.setDescription(description);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('보석 시세 조회 오류:', error);
      await interaction.editReply('⚠️ 시세를 불러오는 중 오류가 발생했습니다.');
    }
  }
};
