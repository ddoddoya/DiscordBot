const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const pool = require('../database'); // 어제 만든 통합 DB 커넥션 풀 불러오기

module.exports = {
  data: new SlashCommandBuilder()
    .setName('알림목록')
    .setDescription('내가 등록한 악세서리 알림 목록을 확인하고 삭제합니다.'),

  async execute(interaction) {
    // 💡 팩트: 개인의 알림 목록이므로 남들에게 보이지 않게 ephemeral(나만 보기) 설정으로 띄웁니다.
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. DB에서 이 명령어를 친 유저(user_id)의 알림만 전부 가져옵니다.
      const [alerts] = await pool.query('SELECT * FROM auction_alerts WHERE user_id = ?', [interaction.user.id]);

      // 등록된 알림이 없을 경우의 예외 처리
      if (alerts.length === 0) {
        return interaction.editReply('❌ 현재 등록해 두신 악세서리 알림이 없습니다.');
      }

      // 2. 임베드와 드롭다운 메뉴 구성
      const embed = new EmbedBuilder()
        .setTitle('📋 나의 악세서리 알림 목록')
        .setColor('Blue')
        .setDescription('현재 감시 중인 매물 목록입니다. 아래 드롭다운 메뉴를 선택하여 알림을 삭제할 수 있습니다.');

      const selectOptions = [];

      // 3. 가져온 알림 데이터를 반복문으로 돌면서 화면에 예쁘게 표시
      alerts.forEach((alert, index) => {
        // DB에 JSON 문자열로 저장된 검색 조건을 다시 자바스크립트 객체로 변환
        const body = typeof alert.search_body === 'string' ? JSON.parse(alert.search_body) : alert.search_body;
        
        // 악세서리 부위 이름 찾기 (목걸이, 귀걸이, 반지)
        const categoryName = body.CategoryCode === 200010 ? '목걸이' : body.CategoryCode === 200020 ? '귀걸이' : '반지';
        
        // 간략한 요약 텍스트 만들기 (예: 목걸이 - 100,000골드 이하)
        const summary = `${categoryName} - 목표가: ${alert.target_price.toLocaleString()}골드 이하`;
        
        // 임베드 필드에 추가 (최대 25개까지 가능)
        embed.addFields({
          name: `${index + 1}번 알림 (ID: ${alert.id})`,
          value: summary,
          inline: false
        });

        // 드롭다운 메뉴의 선택지로 추가
        selectOptions.push({
          label: `${index + 1}번 알림 삭제`,
          description: summary,
          value: alert.id.toString() // 💡 팩트: DB의 고유 ID(Primary Key)를 value로 숨겨둡니다.
        });
      });

      // 4. 드롭다운 컴포넌트(UI) 생성
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('delete_alert_menu')
        .setPlaceholder('❌ 삭제할 알림을 선택하세요')
        .addOptions(selectOptions.slice(0, 25)); // 팩트: 디스코드 메뉴는 최대 25개까지만 들어갑니다.

      const row = new ActionRowBuilder().addComponents(selectMenu);

      // 5. 유저에게 메시지 전송
      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      // 6. 유저가 드롭다운에서 항목을 선택했을 때의 이벤트 감지 (Collector)
      const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.StringSelect, 
        time: 1800000 // 180초 동안만 유효함
      });

      collector.on('collect', async i => {
        // 선택한 드롭다운 값 (우리가 숨겨둔 DB의 id 값)
        const alertIdToDelete = i.values[0];

        try {
          // DB에서 해당 ID의 알림을 완전히 삭제 (보안을 위해 user_id도 한 번 더 체크)
          await pool.query('DELETE FROM auction_alerts WHERE id = ? AND user_id = ?', [alertIdToDelete, interaction.user.id]);

          await i.reply({ content: `✅ 선택하신 알림(ID: ${alertIdToDelete})이 성공적으로 삭제되었습니다.`, ephemeral: true });
          
          // 알림이 지워졌으므로 드롭다운 메뉴를 비활성화 처리
          selectMenu.setDisabled(true);
          await interaction.editReply({ components: [new ActionRowBuilder().addComponents(selectMenu)] });
          
        } catch (dbError) {
          console.error('알림 삭제 중 DB 에러:', dbError);
          await i.reply({ content: '❗️ 삭제 중 오류가 발생했습니다.', ephemeral: true });
        }
      });

      collector.on('end', collected => {
        // 60초가 지나면 버튼이 더 이상 작동하지 않게 비활성화
        selectMenu.setDisabled(true);
        interaction.editReply({ components: [new ActionRowBuilder().addComponents(selectMenu)] }).catch(() => {});
      });

    } catch (error) {
      console.error('알림 목록 조회 오류:', error);
      await interaction.editReply('❗️ 데이터베이스에서 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }
};