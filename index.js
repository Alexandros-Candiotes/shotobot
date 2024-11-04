
require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const TARGET_BOT_ID = "792827809797898240"; // Replace with the actual bot ID
const GUILD_ID = "1252365580812550165";
const CLIENT_ID="1302922587910967306"
const SUMMON_IMAGE_WAIT_MINUTES = 20; // Default wait time for summon.webp
let userDropTimers = {}; // Store timers for each user
let waitingForResponse = {}; // Track users waiting for the next message

// Function to detect the wait message pattern and extract the time in minutes
function getWaitTimeFromMessage(message) {
    const match = message.content.match(
        /you must wait \*\*(\d+)\s*minutes\*\*/,
    );
    if (message.author.id === TARGET_BOT_ID && match) {
        return parseInt(match[1], 10); // Return wait time in minutes if found
    }
    return null;
}

// Function to check for summon.webp image
function hasSummonImage(message) {
    return (
        message.author.id === TARGET_BOT_ID &&
        message.attachments.some((attachment) =>
            attachment.url.includes("summon.webp"),
        )
    );
}

// Register slash commands
async function registerCommands() {
    const commands = [
        {
            name: "timeleft",
            description: "Check the time left before the next drop.",
        },
    ];

    const rest = new REST({ version: "9" }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            {
                body: commands,
            },
        );
        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error("Error registering commands:", error);
    }
}

// Event triggered when bot logs in
client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands(); // Register commands when bot is ready
});

// Listen for the "ts" command and set up a listener for the next message from the target bot
client.on("messageCreate", async (message) => {
    if (message.content.toLowerCase() === "ts" && !message.author.bot) {
        const userId = message.author.id;

        if (waitingForResponse[userId]) {
            message.channel.send(
                `🔄 <@${userId}>, you already have a timer being set. Please wait.`,
            );
            return;
        }

        console.log(
            `<@${userId}>, waiting for the next message from the target bot...`,
        );

        // Set the user as waiting for a response
        waitingForResponse[userId] = true;

        // Wait for the next message from the target bot
        const filter = (msg) => msg.author.id === TARGET_BOT_ID;
        const collector = message.channel.createMessageCollector({
            filter,
            time: 60000,
            max: 1,
        });

        collector.on("collect", (msg) => {
            const waitTimeMinutes = getWaitTimeFromMessage(msg);
            if (waitTimeMinutes !== null) {
                // Set timer based on detected wait time
                const nextDropTime = Date.now() + waitTimeMinutes * 60 * 1000;

                // Clear previous timer if it exists
                if (userDropTimers[userId]) {
                    clearTimeout(userDropTimers[userId].timeout);
                }

                // Set the timer based on the wait time
                userDropTimers[userId] = {
                    timeout: setTimeout(
                        () => {
                            message.channel.send(
                                `🚨 <@${userId}>, the drop is now ready! 🚨`,
                            );
                            delete userDropTimers[userId]; // Clean up the timer
                        },
                        waitTimeMinutes * 60 * 1000,
                    ),
                    nextDropTime: nextDropTime,
                };

                message.channel.send(
                    `🔄 <@${userId}>, your timer has been set for ${waitTimeMinutes} minutes.`,
                );
                console.log(
                    `TS timer set for user <@${userId}> with ${waitTimeMinutes} minutes. Next drop time: ${new Date(nextDropTime).toLocaleTimeString()}`,
                );
            } else if (hasSummonImage(msg)) {
                // Set a 20-minute timer for the summon image
                const nextDropTime =
                    Date.now() + SUMMON_IMAGE_WAIT_MINUTES * 60 * 1000;

                // Clear previous timer if it exists
                if (userDropTimers[userId]) {
                    clearTimeout(userDropTimers[userId].timeout);
                }

                userDropTimers[userId] = {
                    timeout: setTimeout(
                        () => {
                            message.channel.send(
                                `🚨 <@${userId}>, the drop is now ready! 🚨`,
                            );
                            delete userDropTimers[userId]; // Clean up the timer
                        },
                        SUMMON_IMAGE_WAIT_MINUTES * 60 * 1000,
                    ),
                    nextDropTime: nextDropTime,
                };

                message.channel.send(
                    `🔄 <@${userId}>, your timer has been set for 20 minutes due to summon image.`,
                );
                console.log(
                    `Summon image detected for user <@${userId}>. Timer set for 20 minutes. Next drop time: ${new Date(nextDropTime).toLocaleTimeString()}`,
                );
            } else {
                console.log(
                    `No valid message type found for user <@${userId}>.`,
                );
            }

            // Clear the waiting status for the user
            delete waitingForResponse[userId];
        });

        collector.on("end", (collected, reason) => {
            if (reason === "time") {
                message.channel.send(
                    `⏳ <@${userId}>, no valid message received from the target bot within 1 minute.`,
                );
                console.log(
                    `Timeout: No message from target bot for user <@${userId}>.`,
                );
                delete waitingForResponse[userId];
            }
        });
    }
});

// Listen for interaction events (for slash commands)
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    console.log(`Received command: ${commandName}`);

    if (commandName === "timeleft") {
        const userId = interaction.user.id;

        if (userDropTimers[userId]) {
            const timeLeft = userDropTimers[userId].nextDropTime - Date.now();
            const minutesLeft = Math.floor(timeLeft / (60 * 1000));
            const secondsLeft = Math.floor((timeLeft % (60 * 1000)) / 1000);

            if (timeLeft > 0) {
                await interaction.reply(
                    `⏳ Time left before the next drop: ${minutesLeft} minutes and ${secondsLeft} seconds.`,
                );
            } else {
                await interaction.reply(
                    `🚨 <@${userId}>, the drop is ready! 🚨`,
                );
            }
        } else {
            await interaction.reply("No drop is currently scheduled for you.");
        }
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);
