const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('쌀산기')
    .setDescription('경매 아이템의 손익분기점과 추천 입찰가를 계산합니다.')
    .addIntegerOption(opt => 
      opt.setName('인원')
        .setDescription('레이드 인원수를 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '3명', value: 3 },
          { name: '4명', value: 4 },
          { name: '8명', value: 8 }
        ))
    .addIntegerOption(opt => 
      opt.setName('가격')
        .setDescription('거래소 최저가를 입력하세요.')
        .setRequired(true)),

  async execute(interaction) {
    const numPeople = interaction.options.getInteger('인원');
    const marketPrice = interaction.options.getInteger('가격');

    // 💡 [계산 팩트]
    // 1. 수수료 제외 가치 (95%)
    const netValue = marketPrice * 0.95;
    
    // 2. 손익 분기점 (내가 냈을 때와 남이 냈을 때 분배금이 같아지는 지점)
    // 공식: 실제가치 * (인원-1) / 인원
    const breakEven = Math.floor(netValue * ((numPeople - 1) / numPeople));
    
    // 3. 입찰 추천가 (손익분기점 대비 10% 수익을 보장하는 가격)
    // 공식: 손익분기점 / 1.1
    const recommended = Math.floor(breakEven / 1.1);

    const embed = new EmbedBuilder()
      .setTitle('⚖️ 쌀산기')
      .setColor('Blue')
      .setAuthor({ name: `${numPeople}인 기준` })
      .addFields(
        { name: '💰 거래소 가격', value: `\`${marketPrice.toLocaleString()} G\``, inline: false },
        { name: '📉 손익 분기점', value: `**${breakEven.toLocaleString()} G**`, inline: true },
        { name: '✅ 입찰 추천가', value: `**${recommended.toLocaleString()} G**`, inline: true }
      )

    await interaction.reply({ embeds: [embed] });
  }
};