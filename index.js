/* Require the necessary discord.js classes */
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token } = require('./config.json');
const cron = require('node-cron');

/* Create a new client instance */
global.client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.cooldowns = new Collection();
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) { 
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		/* Set a new item in the Collection with the key as the command name and the value as the exported module */
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}	
	}	
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

/* Log in to Discord with your client's token */
client.login(token);

const { dailyCaller } = require('./commands/core/daily.js');
/* 
 *           # ┌────────────── second (optional)
 *           # │ ┌──────────── minute
 *           # │ │ ┌────────── hour
 *           # │ │ │ ┌──────── day of month
 *           # │ │ │ │ ┌────── month
 *           # │ │ │ │ │ ┌──── day of week
 *           # * * * * * *
 */
cron.schedule('0 * * * * *', () => {
	const now = new Date();
	if (now.getHours() == 14 && now.getMinutes() == 0) {
		console.log(`cron started at ${now}`);
		console.log('cron running at 8AM Central Standard Time');
		dailyCaller(client);
	}
});


