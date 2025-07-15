require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]  // 봇이 슬래시 커맨드 등을 처리하려면 이 인텐트는 필수
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// commands 폴더 안 모든 명령어 파일 불러와서 client.commands에 저장
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`${client.user.tag} 봇이 온라인입니다!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;  // 슬래시 커맨드가 아니면 무시

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
    } else {
      await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
