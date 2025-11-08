const { Client, IntentsBitField, PermissionFlagsBits, MessageFlags, SlashCommandBuilder, ChannelType } = require('discord.js');
const { channelMention } = require('discord.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

var file_data = {};
async function file_load(ftype) {
	if (!(ftype in file_data)) {
		file_data[ftype] = [];
		file_data[ftype] = JSON.parse(await fsp.readFile(ftype+'.json'));
	}
}

async function file_change(ftype) {
	if (!('last_change' in file_change)) {
		file_change.last_change = {};
	}
	if (typeof file_change.last_change[ftype] == 'undefined') {
		file_change.last_change[ftype] = 0;
	}
	const batch_secs = 60;

	const now = Date.now();
	if (file_change.last_change[ftype] == 0) { file_change.last_change[ftype] = now; }

	/* If the changes are older than a minute, then we should save */
	if ((now - file_change.last_change[ftype]) > (batch_secs * 1_000)) {
		fs.writeFile(ftype+'.json',JSON.stringify(file_data[ftype],null,2),err => {
			if (err) {
				console.error(err);
				setTimeout(() => { file_change(ftype); }, (batch_secs+2) * 1_000);
			} else {
				file_change.last_change[ftype] = 0;
			}
		});
	} else {
		/* we want to limit writes, batch the changes together */
		file_change.last_change[ftype] = now;
		setTimeout(() => { file_change(ftype); }, (batch_secs+2) * 1_000);
	}
}


async function addChannel(channel) {
	await file_load('daily');
	var alreadySet = false;
	file_data['daily'].forEach((v) => {
		if (v.id == channel.id) {
			alreadySet = true;
		}
	});
	if (!alreadySet) {
		file_data['daily'].push(channel);
	}
	file_change('daily');
}

async function removeChannel(channel) {
	await file_load('daily');
	var newList = [];
	file_data['daily'].forEach((v) => {
		if (v.id != channel.id) {
			newList.push(v);
		}
	});
	file_data['daily'] = newList;
	file_change('daily');
}

async function getChannels() {
	await file_load('daily');
	return file_data['daily'];
}

function generateCode() {
	const alphabet = 'ABCDEFGHKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789';
	const length = 3; 
	let result = '';
	for (i = 0; i < length; i++) {
		const index = Math.floor(Math.random() * alphabet.length);
		result += alphabet[index];
	}
	const bannedWords = [
		'N[I1!]+G','F[A@]+G','G[A@]+Y','[A@]+B[E3]+',
		'[A@]+FR[O0]+','[A@]+P[E3]+','B[I1!]+MB[O0]+',
		'CH[I1!]+NK','CR[O0]+W','D[E3]+[I1!]+','D[I1!]+NK',
		'FL[I1!]+P','N[E3]+GR[O0]+','K[I1!]+T[E3]+',
		'[KM][I1!]+{A@]+','NR[A@]+',
		'KKK','[I1!]+CE','KGB','18-','K[I1!]D','CH[I1!]LD',
		'TRUMP','FTRMP','[O0]BAMA','K[I1!]RK', 
		'311','420','666','911','COP','D[I1!]E',
		'FCK','FKN','FUC','FUQ','G[A4]S','G[O0]D', 
		'GUN','H[I1!]V','H[I1!]T','K[I1!]L','LSD',
		'[O0]XY','PCP','P[0O]T','WAR','HJT'
		/* TODO: add additional banned words */
		];
	for (const ban of bannedWords) {
		const regex = new RegExp(".*"+ban+".*",'i');
		if (regex.test(result)) {
			console.log('regenerating - code was part of banned list');
			return generateCode();
		}
	}
	return result;
}

async function dailyCall(client) {
	const channels = await getChannels();
	const today = new Date();
	const date = today.toLocaleDateString('en-US', { 
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	for (const v of channels) {
		let code = generateCode();
		console.log(`Code for ${v.name} is "${code}"`);
		client.channels.fetch(v.id)
			.then(targetChannel => {
				if (targetChannel && targetChannel.isTextBased()) {
					targetChannel.send(`:loudspeaker: ${date} - Cage Check Call!\n`
						+`Today's photo code is: ${code}\n\n`
						+`Rules summary:\n`
						+`Option 1 - Photo Check :camera_with_flash:: Post a photo showing both your cage and the code of the day\n`
						+`Option 2 - Honor Check :medal:: React with :lock: if caged, or with :no_hard_on: if not caged and uncummed`);
				} else {
					console.log('Channel not found or not a text-based channel');
				}
			});
	}
}


module.exports = {
	data: new SlashCommandBuilder()
		.setName('daily')
		.setDescription('Commands involving a daily cage check post')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((subcommand) => 
			subcommand
				.setName('add')
				.setDescription('Add a channel to post in')
				.addChannelOption((option) => 
					option
						.setName('channel')
						.setDescription('The channel to post into')
						.setRequired(true)
						.addChannelTypes(ChannelType.GuildText)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('remove')
				.setDescription('Remove a channel from posting in')
				.addChannelOption((option) =>
					option
						.setName('channel')
						.setDescription('The channel to remove posting to')
						.setRequired(true)
						.addChannelTypes(ChannelType.GuildText)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('list')
				.setDescription('List the channels posting a daily check')
		),
	async execute(interaction) {
		var message = '';
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case 'add': {
				const channel = interaction.options.getChannel('channel');
				message = `A daily cage check for #${channel.name} has been started`;
				addChannel(channel);
				break;
			}
			case 'remove': {
				const channel = interaction.options.getChannel('channel');
				message = `Cage check for #${channel.name} has been removed`;
				removeChannel(channel);
				break;
			}
			case 'list': {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				const channels = await getChannels();
				message = "Posting in channels: \n";
				for (const v of channels) {
					const target = await global.client.channels.fetch(v.id);
					const canSee = target
						.permissionsFor(interaction.member)
						.has(PermissionFlagsBits.ViewChannel);
					if (canSee) { 
						message += channelMention(v.id)+"\n";
					}
				}
				await interaction.editReply({
					content: message,
					flags: MessageFlags.Ephemeral,
				});
				return;
				break;
			}
		}
		
		await interaction.reply({
			content: message,
			flags: MessageFlags.Ephemeral,
		});
	},
	async dailyCaller(client) {
		await dailyCall(client);
	},
};
