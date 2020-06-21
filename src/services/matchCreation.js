const CONSTANTS = require('../constants')
const moment = require('moment-timezone')

module.exports = exports = {
  name: 'matchCreation',
  enabled: true,
  process: async (GLOBALS) => {
    GLOBALS.client.on('message', async message => {
      if (message.author === GLOBALS.client.user || message.author.bot === true) return // ignore messages from the bot itself or other bots
      if (GLOBALS.activeMatchCreation.has(message.author.id)) handleMatchCreation(GLOBALS.activeMatchCreation.get(message.author.id), message, GLOBALS)
    })
    GLOBALS.client.on('messageReactionAdd', (reaction, user) => {
      if (user.bot) return // ignore messages from the bot itself or other bots
      if (GLOBALS.activeMatchCreation.has(user.id)) cancelMatchCreation(reaction, user, GLOBALS)
    })
  }
}

const handleMatchCreation = async (matchRecord, userMessage, GLOBALS) => {
  if (userMessage.channel !== matchRecord.botMessage.channel) return

  if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) userMessage.delete({ timeout: 500 })
  switch (matchRecord.step) {
    case 0: {
      const dateString = userMessage.content.split(' ')
      if (dateString.length === 2) {
        const actualDate = moment().tz(process.env.TIME_ZONE || 'America/Los_Angeles').format('YYYY-MM-DD')
        dateString.push(actualDate)
      }

      const date = moment.tz(dateString.join(' '), 'h:mm a YYYY-MM-DD', process.env.TIME_ZONE || 'America/Los_Angeles').toDate()
      if (isNaN(date)) return userMessage.reply('please give a valid date!').then(msg => msg.delete({ timeout: 5000 }))
      matchRecord.creationInformation.date = date
      break
    }
    case 1: {
      if (userMessage.content.toLowerCase() === 'any') {
        matchRecord.creationInformation.rankMinimum = 0
        break
      } else if (!CONSTANTS.RANKS[userMessage.content.toUpperCase()]) {
        return userMessage.reply('please give a valid rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.rankMinimum = CONSTANTS.RANKS[userMessage.content.toUpperCase()] // TODO: cover edge cases
        break
      }
    }
    case 2: {
      if (userMessage.content.toLowerCase() === 'any') {
        matchRecord.creationInformation.rankMaximum = 99
        break
      } else if (!CONSTANTS.RANKS[userMessage.content.toUpperCase()]) {
        return userMessage.reply('please give a valid rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else if (CONSTANTS.RANKS[userMessage.content.toUpperCase()] < matchRecord.creationInformation.rankMinimum) {
        return userMessage.reply('the maximum rank cannot be below the minimum rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.rankMaximum = CONSTANTS.RANKS[userMessage.content.toUpperCase()] // TODO: cover edge cases
        break
      }
    }
    case 3: {
      if (!Number(userMessage.content) || Number(userMessage.content) > 5) {
        return userMessage.reply('please give a valid number!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.maxTeamCount = Number(userMessage.content)
        break
      }
    }
    case 4:
      matchRecord.creationInformation.spectators = (CONSTANTS.AFFIRMATIVE_WORDS.includes(userMessage.content.toLowerCase())) ? [] : false
      break
    case 5: {
      if (userMessage.content.toLowerCase() === 'any') {
        matchRecord.creationInformation.map = CONSTANTS.MAPS[Math.floor(Math.random() * Math.floor(CONSTANTS.MAPS.length))]
        break
      } else if (isNaN(userMessage.content) || Number(userMessage.content) > CONSTANTS.MAPS.length) {
        return userMessage.reply('please give a valid number!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.map = CONSTANTS.MAPS[Number(userMessage.content - 1)]
        break
      }
    }
  }

  if (matchRecord.step < CONSTANTS.matchCreationSteps.length - 1) {
    const embed = matchRecord.botMessage.embeds[0]

    const previousField = embed.fields[matchRecord.step]
    previousField.name = '✅ ' + previousField.name

    matchRecord.step = matchRecord.step + 1

    const stepInfo = CONSTANTS.matchCreationSteps[matchRecord.step]
    embed.addField(stepInfo[0], stepInfo[1])
    matchRecord.botMessage.edit(embed)

    GLOBALS.activeMatchCreation.set(matchRecord.userID, matchRecord)
  } else {
    const embed = new GLOBALS.Embed()
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .setTitle('Match Creation Complete')
      .setDescription('Your match has been made! To start it, type `v!match start <match id>`')
      .setFooter('This message will self-destruct in 30 seconds.')
    matchRecord.botMessage.edit(embed)
    matchRecord.botMessage.delete({ timeout: 30000 })
    if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) matchRecord.botMessage.reactions.removeAll()
    else matchRecord.botReaction.remove()
    matchRecord.creationInformation.timestamp = new Date()

    const matchEmbed = new GLOBALS.Embed()
      .setTitle('Match Information')
      .setDescription('React with 🇦 to join the A team, react with 🇧 to join the B team and, if enabled, react with 🇸 to be a spectator.')
      .setThumbnail(CONSTANTS.MAPS_THUMBNAILS[matchRecord.creationInformation.map])
      .setTimestamp(new Date(matchRecord.creationInformation.date))
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .addField('Status', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.status), true)
      .addField('Date', moment(matchRecord.creationInformation.date).tz(process.env.TIME_ZONE || 'America/Los_Angeles').format('h:mm a z DD MMM, YYYY'), true)
      .addField('Map', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.map), true)
      .addField('Max Team Count', matchRecord.creationInformation.maxTeamCount + ' players per team', true)
      .addField('Minimum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMinimum]), true)
      .addField('Maximum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMaximum]), true)
      .addField('Team A', 'None', true)
      .addField('Team B', 'None', true)
      .addField('Spectators', matchRecord.creationInformation.spectators instanceof Array ? 'None' : 'Not allowed', true)
    matchRecord.botMessage.channel.send('<@&717802617534808084> a match has been created!', matchEmbed)
      .then(message => {
        message.react('🇦')
        message.react('🇧')
        if (matchRecord.creationInformation.spectators) message.react('🇸')
        matchEmbed.setFooter('match id: ' + message.id)
        console.log('match id: ' + message.id)
        message.edit(matchEmbed)
        matchRecord.userMessage.delete()
        matchRecord.creationInformation.message = {
          id: message.id,
          channel: message.channel.id
        }
        GLOBALS.db.collection('matches').doc(message.id).set(matchRecord.creationInformation)
        GLOBALS.activeMatchCreation.delete(matchRecord.userID)
      })
  }
}

const cancelMatchCreation = async (reaction, user, GLOBALS) => {
  if (reaction.emoji.name === '❌') {
    const userRecord = GLOBALS.activeMatchCreation.get(user.id)
    const embed = new GLOBALS.Embed()
      .setTitle('ScrimBot Match Creation Cancelled')
      .setDescription('Your Match Creation has been cancelled. If you want to try again, just type v!match create.')
    userRecord.botMessage.edit(embed)
    GLOBALS.activeMatchCreation.delete(userRecord.userID)
    reaction.remove()
  }
}
