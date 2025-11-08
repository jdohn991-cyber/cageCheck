const { Client, IntentsBitField, PermissionFlagsBits, MessageFlags, SlashCommandBuilder, ChannelType } = require('discord.js');
const { channelMention } = require('discord.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/** FILE UTILITY **/
/* TODO: This may end up moving to a utilities file */
var file_data = {};

/* Function to load a particular data file
 */
async function file_load(ftype) {
	if (!(ftype in file_data)) {
		file_data[ftype] = [];
		if (fs.existsSync(ftype+'.json')) {
			file_data[ftype] = JSON.parse(await fsp.readFile(ftype+'.json'));
		}
	}
}

/* Function to indicate a change to a file contents in memory
 * Notes the chnage, but attempts to batch changes into groups
 * to prevent over-demand on file modification 
 */
async function file_change(ftype) {
	console.log(`file change for "${ftype}"`);
	if (!('last_change' in file_change)) {
		file_change.last_change = {};
		file_change.waiting = {};
	}
	if (typeof file_change.last_change[ftype] == 'undefined') {
		file_change.last_change[ftype] = 0;
		file_change.waiting[ftype] = false;
	}
	const batch_secs = 60;

	const now = Date.now();
	if (file_change.last_change[ftype] == 0) {
		file_change.last_change[ftype] = now; 
		file_change.waiting[ftype] = false;
	}

	/* If the changes are older than a minute, then we should save */
	if ((now - file_change.last_change[ftype]) > (batch_secs * 1_000)) {
		console.log(`file change written to disk for "${ftype}"`);
		fs.writeFile(ftype+'.json',JSON.stringify(file_data[ftype],null,2),err => {
			if (err) {
				console.error(err);
				setTimeout(() => { file_change(ftype); }, (batch_secs+2) * 1_000);
			} else {
				file_change.waiting[ftype] = false;
				file_change.last_change[ftype] = 0;
			}
		});
	} else if (file_change.waiting[ftype]) { 
		/* already know about a change in this file */
	} else {
		/* we want to limit writes, batch the changes together */
		file_change.last_change[ftype] = now;
		file_change.waiting[ftype] = true;
		console.log(`waiting ${batch_secs+2} seconds`);
		setTimeout(() => { file_change(ftype); }, (batch_secs+2) * 1_000);
	}
}
/** END OF FILE UTILITY **/


/** ROLES DATA **/
/* Add a role to a specific channel */
async function addRoleToChannel(channel,role) {
	await file_load('daily-roles');
	role.channel = channel;
	for (var r of file_data['daily-roles']) {
		if (r.id == role.id && r.channel == channel.id) {
			/* Found the role for this channel */
			return;
		}
	}
	/* role for this channel is not present, add it */
	file_data['daily-roles'].push(role);
	file_change('daily-roles');
}

/* Remove a role from a specific channel */
async function removeRoleFromChannel(channel, role) {
	await file_load('daily-roles');
	var newList = [];
	var didRemove = false;
	for (var r of file_data['daily-roles']) {
		if (r.id == role.id && r.channel == channel.id) {
			didRemove = true;
		} else {
			newList.push(r);
		}
	}
	
	/* If we actually removed something, record the change */
	if (didRemove) {
		file_data['daily-roles'] = newList;
		file_change('daily-roles');
	}
}

/* Get a list of roles for a specific channel */
async function getRoles(channel) {
	await file_load('daily-roles');
	var result = [];
	for (const r of file_data['daily-roles']) {
		if (r.channel == channel.id) {
			result.push(r);
		}
	}
	return result;
}

/* Add a channel to the list */
async function addChannel(channel) {
	await file_load('daily');
	/* Verify the channel is not already in the list */
	for (const c of file_data['daily']) {
		if (c.id == channel.id) {
			/* Channel already in list */
			return;
		}
	}
	/* Add the channel */
	file_data['daily'].push(channel);
	file_change('daily');
}

/* Remove a channel from the list */
async function removeChannel(channel) {
	await file_load('daily');
	/* Build the new list */
	var newList = [];
	var didRemove = false;
	for (const c of file_data['daily']) {
		if (c.id != channel.id) {
			newList.push(c);
		} else { didRemove = true; }
	}
	/* If we actually removed something, record the change */
	if (didRemove) {
		file_data['daily'] = newList;
		file_change('daily');
	}
}

/* Get a list of channels in the list */
async function getChannels() {
	await file_load('daily');
	return file_data['daily'];
}

/* Generate a code for the check-in */
function generateCode() {
	const alphabet = 'ABCDEFGHKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789';
	const length = 3; 
	let result = '';
	/* Build code character by character */
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
	/* Ensure the code is not part of the list of banned codes */
	for (const ban of bannedWords) {
		const regex = new RegExp(".*"+ban+".*",'i');
		if (regex.test(result)) {
			console.log('regenerating - code was part of banned list');
			return generateCode();
		}
	}
	return result;
}

/* Post a message in the channels configured */
async function dailyCall(client) {
	const channels = await getChannels();
	const today = new Date();
	const date = today.toLocaleDateString('en-US', { 
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	/* For each channel, make a post */
	for (const v of channels) {
		let code = generateCode();
		const roles = getRoles(v);
		roleTags = '';
		for (const r of roles) {
			roleTags += `<@&${role.id}>`;
		}
		console.log(`Code for ${v.name} is "${code}"`);
		client.channels.fetch(v.id)
			.then(targetChannel => {
				if (targetChannel && targetChannel.isTextBased()) {
					targetChannel.send(`:loudspeaker: ${date} - Cage Check Call!\n`
						+`${roleTags}\n`
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

/* Exports for others to call */
module.exports = {
	/* Command Structure:
	 * /daily 
	 *     |- add    [channel]
	 *     |- remove [channel]
	 *     |- list 
	 *     |- role_add    [channel] [role]
	 *     |- role_remove [channel] [role]
	 *     |- role_list 
	 */
	data: new SlashCommandBuilder()
		.setName('daily')
		.setDescription('Commands involving a daily cage check post')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((subcommand) => subcommand
			.setName('add')
			.setDescription('Add a channel to post in')
			.addChannelOption((option) => option
				.setName('channel')
				.setDescription('The channel to post into')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText)
			)
		)
		.addSubcommand((subcommand) => subcommand
			.setName('remove')
			.setDescription('Remove a channel from posting in')
			.addChannelOption((option) => option
				.setName('channel')
				.setDescription('The channel to remove posting to')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText)
			)
		)
		.addSubcommand((subcommand) => subcommand
			.setName('list')
			.setDescription('List the channels posting a daily check')
		)
		.addSubcommand((subcommand) => subcommand
			.setName('role_add')
			.setDescription('Add a role to tag in daily posts')
			.addChannelOption((option) => option
				.setName('channel')
				.setDescription('The channel to add the role tag to')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText)
			)
			.addRoleOption((option) => option
				.setName('role')
				.setDescription('The role to tag in posts')
				.setRequired(true)
			)
		)
		.addSubcommand((subcommand) => subcommand
			.setName('role_remove')
			.setDescription('Remove a role from tagging in daily posts')
			.addChannelOption((option) => option
				.setName('channel')
				.setDescription('The channel to remove the role tag from')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText)
			)
			.addRoleOption((option) => option
				.setName('role')
				.setDescription('The role to remove from tagging')
				.setRequired(true)
			)
		)
		.addSubcommand((subcommand) => subcommand
			.setName('role_list')
			.setDescription('List the roles that are tagged in daily posts')
			.addChannelOption((option) => option
				.setName('channel')
				.setDescription('The channel to get the role tagging configuration for')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText)
			)
		),
	async execute(interaction) {
		var message = '';
		const subcommand = interaction.options.getSubcommand();

		/* Which command did we get */
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
			case 'role_add': 
			case 'role_remove': 
			case 'role_list': {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				const channel = interaction.options.getChannel('channel');
				const channels = await getChannels();
				var channelFound = false;
				for (const v of channels) {
					if (channel.id == v.id) {
						channelFound = true;
						break;
					}
				}
				if (!channelFound) {
					/* The channel is not configured for posting in,
					 * can't configure role tagging prior to that 
					 */
					message = 'Channel not configured to post in';
					break;
				}
				switch (subcommand) {
					case 'role_add': {
						const role = interaction.options.getRole('role');
						addRoleToChannel(channel,role);
						message = `Role ${role.name} has been added to ${channel.name}`;
						break;
					}
					case 'role_remove': {
						const role = interaction.options.getRole('role');
						removeRoleFromChannel(channel,role);
						message = `Role ${role.name} has been removed from ${channel.name}`;
						break;
					}
					case 'role_list': {
						const roles = await getRoles(channel);
						message = `In ${channel.name}, tag roles: \n`;
						for (const r of roles) {
							const targetGuild = await global.client.guilds.fetch(channel.guildId);
							if (!targetGuild) {
								message = 'Unable to load guild to get role names';
								break;
							}
							const target = targetGuild.roles.cache.get(r.id);
							message += `<@&${r.id}>\n`;
						}
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
