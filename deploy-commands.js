const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// commands 폴더 안 모든 명령어 파일에서 data 추출해서 commands 배열에 저장
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('서버(길드) 단위 슬래시 명령어 등록 시작...');

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId), // 서버 ID 넣어서 등록
      { body: commands }
    );

    console.log('서버 슬래시 명령어 등록 완료!');
  } catch (error) {
    console.error(error);
  }
})();
