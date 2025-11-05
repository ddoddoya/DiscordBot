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

const VALID_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const VALID_TIME = (t) => t === '상관없음' || (Number.isInteger(Number(t)) && Number(t) >= 0 && Number(t) <= 26);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('일정추가')
    .setDescription('요일별로 시간대를 한 번에 추가합니다')
    .addStringOption(option =>
      option.setName('그룹이름').setDescription('ex)7월 4주차면 ->7-4').setRequired(true))
    .addStringOption(option =>
      option.setName('이름').setDescription('저장할 이름').setRequired(true))
    .addStringOption(option =>
      option.setName('요일별시간').setDescription('ex) 월,화=21~24,수,목=20~25,토,일=상관없음').setRequired(true)),

  async execute(interaction) {
    const group = interaction.options.getString('그룹이름');
    const user = interaction.options.getString('이름');
    const input = interaction.options.getString('요일별시간').replace(/\s/g, '');
    let message = '';
    let errorMessage = '';

    try {
      if (input === '상관없음') {
        for (const day of VALID_DAYS) {
          await pool.execute(
            "DELETE FROM schedules WHERE group_name = ? AND user_name = ? AND day = ?",
            [group, user, day]
          );
          await pool.execute(
            "INSERT INTO schedules (group_name, user_name, day, start, end) VALUES (?, ?, ?, ?, ?)",
            [group, user, day, '상관없음', '상관없음']
          );
        }
        message = `✅ ${group} 그룹에 일정이 추가됨!\n이름: ${user}\n요일: 전체(상관없음)`;
      } else {
        const regex = /([월화수목금토일,]+)=([^,=]+)/g;
        const inserts = [];
        const already = {};
        let match;

        while ((match = regex.exec(input)) !== null) {
          const days = match[1].split(',').map(d => d.trim()).filter(Boolean);
          let [start, end] = match[2].split('~').map(v => v.trim());
          if (!end) end = start;

          for (const day of days) {
            if (!VALID_DAYS.includes(day)) {
              errorMessage = `❌ 요일 오류: "${day}"는 허용되지 않는 요일입니다. (월~일 or 상관없음만 가능)`;
              break;
            }
            if (!VALID_TIME(start) || !VALID_TIME(end)) {
              errorMessage = `❌ 시간 오류: "${start}~${end}"은 올바른 입력이 아닙니다. (숫자 0~26 또는 상관없음)`;
              break;
            }
            if (already[day]) {
              errorMessage = `❌ "${day}" 요일이 중복 지정됐어요. 한 번씩만 입력해주세요.`;
              break;
            }
            already[day] = true;
          }

          if (errorMessage) break; // 에러 발생 시 루프 중단

          for (const day of days) {
            await pool.execute(
              "DELETE FROM schedules WHERE group_name = ? AND user_name = ? AND day = ?",
              [group, user, day]
            );
            await pool.execute(
              "INSERT INTO schedules (group_name, user_name, day, start, end) VALUES (?, ?, ?, ?, ?)",
              [group, user, day, start, end]
            );
            inserts.push(`${day}: ${start}~${end}`);
          }
        }

        if (!errorMessage && inserts.length === 0) {
          errorMessage = `❌ 입력에서 요일/시간을 찾지 못했어요! 예시를 참고해서 작성해주세요.`;
        }

        if (!errorMessage) {
          message = `✅ ${group} 그룹에 일정이 추가됨!\n이름: ${user}\n${inserts.join('\n')}`;
        }
      }

      // reply는 딱 한 번만
      if (errorMessage) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: message });
      }
    } catch (err) {
      console.error('명령어 실행 오류:', err);
      await interaction.reply({ content: '❌ 일정 추가 중 오류가 발생했습니다.', ephemeral: true });
    }
  }
};
