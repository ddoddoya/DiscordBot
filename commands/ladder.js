const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('사다리타기')
    .setDescription('사다리타기 기능 (참가자 ➡️ 결과)')
    .addStringOption(option =>
      option.setName('참가자')
        .setDescription('참가자 이름들을 ,로 구분하여 입력')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('결과')
        .setDescription('결과 항목들을 ,로 구분하여 입력 (부족하면 꽝이 추가됩니다)')
        .setRequired(true)),
  
  async execute(interaction) {
    const participantsInput = interaction.options.getString('참가자');
    const resultsInput = interaction.options.getString('결과');

    const participants = participantsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    let results = resultsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    while (results.length < participants.length) results.push('꽝');

    const shuffledResults = shuffle(results);

    // 참가자 ➡️ 결과 매핑 문자열 만들기
    let resultString = '';
    for (let i = 0; i < participants.length; i++) {
      resultString += `${participants[i]} ➡️ ${shuffledResults[i]}\n`;
    }

    // Embed 생성
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🎲 사다리타기 결과 🎲')
      .setDescription(resultString)
      .setFooter({ text: `요청자: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed] });
  }
};

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length -1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
