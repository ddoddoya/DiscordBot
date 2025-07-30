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
    .setName('일정추가')
    .setDescription('레이드 가능한 일정을 추가합니다')
    .addStringOption(option =>
      option.setName('그룹이름').setDescription('예:7월 4주차면 7-4로 입력').setRequired(true))
    .addStringOption(option =>
      option.setName('이름').setDescription('저장할 이름').setRequired(true))
    .addStringOption(option =>
      option.setName('요일').setDescription('예: 월 or 월,화 or 다 될경우 상관없음 입력').setRequired(true))
    .addStringOption(option =>
      option.setName('시작시간').setDescription('숫자(0~24) 또는 상관없음').setRequired(true))
    .addStringOption(option =>
      option.setName('마감시간').setDescription('숫자(0~24) 또는 상관없음').setRequired(false)),

  async execute(interaction) {
    const group = interaction.options.getString('그룹이름');
    const user = interaction.options.getString('이름');
    const days = interaction.options.getString('요일').replace(/\s/g, '').split(',');
    const start = interaction.options.getString('시작시간');
    const endInput = interaction.options.getString('마감시간');
    const validDays = ['월','화','수','목','금','토','일','상관없음'];
    let end = endInput;
    // 요일 유효성 검사
    for (const day of days) {
      if (!validDays.includes(day)) {
        return interaction.reply({
          content: `❌ 요일 입력 오류: "${day}"는 허용되지 않는 요일입니다. (월,화,수,목,금,토,일,상관없음 중에서 입력해주세요)`,
          ephemeral: true
        });
      }
    }
    // 시작/마감시간 유효성 검사
    if (start !== '상관없음' && !(Number.isInteger(Number(start)) && Number(start) >= 0 && Number(start) <= 24)) {
      return interaction.reply({
        content: `❌ 시작시간 입력 오류: "${start}"은 올바른 숫자가 아니에요! (0~24 또는 상관없음만 가능)`,
        ephemeral: true
      });
    }
    // 마감시간 체크
    if (end && end !== '상관없음' && !(Number.isInteger(Number(end)) && Number(end) >= 0 && Number(end) <= 24)) {
      return interaction.reply({
        content: `❌ 마감시간 입력 오류: "${end}"은 올바른 숫자가 아니에요! (0~24 또는 상관없음만 가능)`,
        ephemeral: true
      });
    }
    
    // 1. 시작시간이 '상관없음'이면 마감시간도 강제로 '상관없음' (둘 다 의미가 없음)
    if (start === '상관없음') {
      end = '상관없음';
    }
    // 2. 시작시간은 정상값, 마감시간만 비었으면 '상관없음'으로 처리 (사용자 실수 방지)
    else if (!end || end === '') {
      end = '상관없음';
    }

    // 여러 요일 입력: 각 요일마다 따로 저장(같은 그룹+유저+요일이면 update/덮어쓰기)
    for (const day of days) {
      // 이미 있는 일정은 삭제(덮어쓰기)
      await pool.execute(
        "DELETE FROM schedules WHERE group_name = ? AND user_name = ? AND day = ?",
        [group, user, day]
      );
      // 새로 저장
      await pool.execute(
        "INSERT INTO schedules (group_name, user_name, day, start, end) VALUES (?, ?, ?, ?, ?)",
        [group, user, day, start, end]
      );
    }

    return interaction.reply({
      content: `✅ ${group} 그룹에 일정이 추가됨!\n이름: ${user}\n요일: ${days.join(', ')}\n시간: ${start} ~ ${end}`,
      ephemeral: true
    });
  }
};
