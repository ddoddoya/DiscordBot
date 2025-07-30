require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('일정삭제')
    .setDescription('특정 요일의 일정을 삭제합니다')
    .addStringOption(option =>
      option.setName('그룹이름').setDescription('삭제할 그룹이름').setRequired(true))
    .addStringOption(option =>
      option.setName('이름').setDescription('저장된 이름').setRequired(true))
    .addStringOption(option =>
      option.setName('요일').setDescription('ex)월 or 월,화(여러 개 가능, 쉼표로 구분)').setRequired(true)),

  async execute(interaction) {
    const group = interaction.options.getString('그룹이름');
    const user = interaction.options.getString('이름');
    const days = interaction.options.getString('요일').replace(/\s/g, '').split(',');

    let deleted = 0;
    for (const day of days) {
      const [rows] = await pool.execute(
        "SELECT * FROM schedules WHERE group_name = ? AND user_name = ? AND day = ?",
        [group, user, day]
      );
      if (!rows.length) continue;
      await pool.execute(
        "DELETE FROM schedules WHERE group_name = ? AND user_name = ? AND day = ?",
        [group, user, day]
      );
      deleted++;
    }

    if (deleted === 0) {
      return interaction.reply({
        content: `❌ 삭제할 일정이 없습니다.`,
        ephemeral: true
      });
    } else {
      return interaction.reply({
        content: `🗑️ ${group} 그룹의 ${user}님의 ${days.join(', ')}요일 일정이 삭제되었습니다!`,
      });
    }
  }
};
