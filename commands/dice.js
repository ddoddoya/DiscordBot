const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('주사위')
    .setDescription('🎲 참가자별로 1~99 사이의 주사위를 굴립니다.')
    .addStringOption(option =>
      option.setName('참가자')
        .setDescription('참가자 이름들을 ,로 구분하여 입력')
        .setRequired(true)
    ),

  async execute(interaction) {
    const participantsInput = interaction.options.getString('참가자');
    const participants = participantsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    // 각 참가자별 주사위 결과 생성
    let resultString = '';
    for (let participant of participants) {
      const roll = Math.floor(Math.random() * 99) + 1; // 1~99 난수
      resultString += `${participant} 🎲 **${roll}**\n`;
    }

    // Embed 생성
    const embed = new EmbedBuilder()
      .setColor(0xFFC300)
      .setTitle('🎲 주사위 결과 🎲')
      .setDescription(resultString)
      .setFooter({ text: `요청자: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed] });
  }
};
