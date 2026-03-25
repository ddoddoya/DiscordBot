const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('각인서')
    .setDescription('유물 각인서 시세를 확인합니다.'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
      const token = process.env.LOSTARK_REST_KEY;

      // 💡 [팩트] 20개를 가져오기 위해 1, 2페이지 동시 호출
      const fetchPage = async (pageNo) => {
        const { data } = await axios.post(`${apiBase}/markets/items`, {
          Sort: 'CURRENT_MIN_PRICE',
          CategoryCode: 40000,
          ItemTier: null,
          ItemName: '유물',
          PageNo: pageNo,
          SortCondition: 'DESC'
        }, { headers: { authorization: `Bearer ${token}` } });
        return data.Items || [];
      };

      const [p1, p2] = await Promise.all([fetchPage(1), fetchPage(2)]);
      const allItems = [...p1, ...p2].filter(item => item.Grade === '유물').slice(0, 20);

      if (allItems.length === 0) return interaction.editReply('❌ 정보를 찾을 수 없습니다.');

      const itemsPerPage = 5;
      let currentPage = 0;
      const totalPages = Math.ceil(allItems.length / itemsPerPage);

      const generateEmbed = (page) => {
        const start = page * itemsPerPage;
        const currentItems = allItems.slice(start, start + itemsPerPage);

        const embed = new EmbedBuilder()
          .setColor('Orange')
          .setAuthor({ 
            name: `유물 각인서 시세`, 
            iconURL: currentItems[0]?.Icon // 현재 페이지 1위 아이콘을 작게 표시
          });

        let desc = "";
        currentItems.forEach((item, index) => {
          const price = item.CurrentMinPrice.toLocaleString();
          // "유물"과 "각인서" 단어를 빼서 텍스트 길이 최적화
          const cleanName = item.Name.replace('유물 ', '').replace(' 각인서', '');
          const globalIndex = start + index + 1;
          
          // 💡 [레이아웃] 이름은 굵게 상단에, 가격은 하단에 이모지와 함께 배치
          desc += `**${globalIndex}. ${cleanName}** 🪙 \`${price} G\`\n`;;
        });

        embed.setDescription(desc);
        embed.setFooter({ text: `Page ${page + 1}/${totalPages}` });

        return embed;
      };

      const getButtons = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
        );
      };

      const message = await interaction.editReply({
        embeds: [generateEmbed(currentPage)],
        components: [getButtons(currentPage)]
      });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000 // 2분
      });

      collector.on('collect', async i => {
        if (i.customId === 'prev') currentPage--;
        else if (i.customId === 'next') currentPage++;
        await i.update({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });

    } catch (error) {
      console.error(error);
      await interaction.editReply('❗️ 시세 조회 중 오류가 발생했습니다.');
    }
  }
};