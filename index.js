require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// commands 폴더에서 커맨드 파일 로드
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`${client.user.tag} 봇이 온라인입니다!`);
});

client.on('interactionCreate', async interaction => {
  // Autocomplete 인터랙션 처리
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        return await command.autocomplete(interaction);
      } catch (err) {
        console.error('Autocomplete 오류:', err);
      }
    }
    return;
  }

  // 슬래시 커맨드 인터랙션 처리
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('명령어 실행 오류:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
    } else {
      await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
