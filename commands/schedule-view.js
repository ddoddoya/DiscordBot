require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const { createCanvas } = require('canvas');
const { AttachmentBuilder } = require('discord.js');

// MySQL 연결 풀
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
    .setName('일정보기')
    .setDescription('일정 그룹의 시간표를 표로 보여줍니다')
    .addStringOption(option =>
      option.setName('그룹이름').setDescription('확인할 그룹 이름').setRequired(true)
    ),

  async execute(interaction) {
    const group = interaction.options.getString('그룹이름');
    const [rows] = await pool.execute(
      "SELECT * FROM schedules WHERE group_name = ?",
      [group]
    );
    if (!rows.length)
      return interaction.reply('등록된 일정이 없습니다.');

    // 시간표 (12~24시, 월~일) 텍스트 표로 구성
    const hours = Array.from({length: 15}, (_, i) => i + 12)//12~24시
    const days = ['월','화','수','목','금','토','일'];
    const table = {};
    for (const d of days) table[d] = {};
    for (const d of days) for (const h of hours) table[d][h] = [];

    // DB에서 불러온 데이터를 시간표 구조로 변환
    rows.forEach(sch => {
    const day = sch.day;
    if (day === '상관없음') {
        for (const d of days) for (const h of hours) table[d][h].push(sch.user_name);
    } else {
        // 나머지는 시작~마감 (마감이 상관없음이면 24시까지)
        const startHour = sch.start === '상관없음' ? 12 : Number(sch.start);
        const endHour = sch.end === '상관없음' ? 26 : Number(sch.end);
        for (let h = startHour; h <= endHour; h++) {
            if (hours.includes(h)) table[day][h].push(sch.user_name);
        }
        }
    });
function makeTableImage(table, days, hours) {
    const NAMES_PER_ROW = 2; // 한 줄에 몇 명씩 쓸지
    const maxPeople = 8; // 최대 8명 기준
    const blueLight = { r: 220, g: 235, b: 255 }; // 옅은 파랑
    const blueDark  = { r: 90,  g: 150, b: 240 }; // 진한 파랑

    // 1. 각 칸별 필요 cell height 계산
    const cellW = 90;
    // 각 시간대별 "최대 인원수"에 따라 칸 높이 동적 계산
    const cellHeights = hours.map(h => {
        let maxRows = 1;
        for (const d of days) {
            const cnt = table[d] && table[d][h] ? table[d][h].length : 0; // 0명인 칸은 0으로
            const rowsNeeded = Math.ceil(cnt / NAMES_PER_ROW); // <-- 한 줄에 2명씩
            if (rowsNeeded > maxRows) maxRows = rowsNeeded;
        }
        return Math.max(48, maxRows * 18 + 16); // 한 줄 18px, 여백 16, 최소 48px
    });

    // 전체 높이
    const totalHeight = cellHeights.reduce((sum, h) => sum + h, 0) + 48; // 헤더
    const width = cellW * (days.length + 1);

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');

    // 배경
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, totalHeight);

    // 표 헤더
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#222';
    for (let i = 0; i < days.length; i++) {
        ctx.fillText(days[i], (i+1) * cellW + 25, 32);
    }

    // 표/라인 그리기
    let y = 48; // 첫 row는 헤더
    for (let j = 0; j < hours.length; j++) {
        ctx.strokeStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        y += cellHeights[j];
    }
    // 세로라인
    for (let i = 0; i <= days.length + 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, totalHeight);
        ctx.stroke();
    }

    // 시간 헤더 (row별 y 좌표도 다름!))
    ctx.font = 'bold 20px sans-serif';
    let yy = 48;
    for (let j = 0; j < hours.length; j++) {
        ctx.fillText(`${hours[j].toString().padStart(2, '0')}시`, 10, yy + 32);
        yy += cellHeights[j];
    }
    
    // 이름들 줄 바꿈(2명씩) 가로쓰기 + 배경 파란색
    let yRow = 48; 
    for (let j = 0; j < hours.length; j++) {
        for (let i = 0; i < days.length; i++) {
            const d = days[i];
            const h = hours[j];
            const names = table[d] && table[d][h] ? table[d][h] : [];

            // 🔵 파란색 진하게: 인원수 비율 따라 보간
            const ratio = Math.min(1, names.length / maxPeople);
            const r = Math.round(blueLight.r + (blueDark.r - blueLight.r) * ratio);
            const g = Math.round(blueLight.g + (blueDark.g - blueLight.g) * ratio);
            const b = Math.round(blueLight.b + (blueDark.b - blueLight.b) * ratio);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect((i+1)*cellW, yRow, cellW, cellHeights[j]);

            // 이름 (검정색)
            ctx.font = '16px sans-serif';
            ctx.fillStyle = '#111';
            for (let k = 0; k < names.length; k++) {
                const col = k % NAMES_PER_ROW;
                const row = Math.floor(k / NAMES_PER_ROW);
                ctx.fillText(
                    names[k],
                    (i+1)*cellW + 5 + col*40,
                    yRow + 22 + row*18
                );
            }
        }
        yRow += cellHeights[j];
    }
        // 표/라인 그리기 (맨 마지막에 진하게)
    ctx.strokeStyle = '#222'; // 진한 검정색
    ctx.lineWidth = 2;        // 더 두껍게(1~2px 추천)
    // 가로줄
    y = 48;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(width, 0);
    for (let j = 0; j < hours.length; j++) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        y += cellHeights[j];
    }
    ctx.moveTo(0, totalHeight); ctx.lineTo(width, totalHeight);
    ctx.stroke();

    // 세로줄
    ctx.beginPath();
    for (let i = 0; i <= days.length + 1; i++) {
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, totalHeight);
    }
    ctx.stroke();
    return canvas;
}

    const canvas = makeTableImage(table, days, hours);
    const buffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

    return interaction.reply({
    content: `**[${group} 일정표]**`,
    files: [attachment],
    });
}

};
