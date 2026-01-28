#!/usr/bin/env node

/**
 * Discord Message Wipe-Delete Tool
 * 
 * This script uses Puppeteer to automate the process of editing messages to blank
 * (to wipe them from Discord's servers) and then deleting them.
 * 
 * Usage:
 *   node scripts/wipe-discord-messages.js
 * 
 * License: AGPL-3.0
 */

const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const prompts = require('prompts');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const DISCORD_URL = 'https://discord.com/channels/@me';

// Selectors (these may need updating if Discord changes their UI)
const SELECTORS = {
  messageContent: '[class*="messageContent-"]',
  messageActions: '[class*="buttonContainer-"]',
  moreButton: '[aria-label="More"]',
  editButton: '[id^="message-actions-edit"]',
  deleteButton: '[id^="message-actions-delete"]',
  textArea: '[class*="textArea-"][role="textbox"]',
  confirmDelete: '[type="submit"]',
  chatScroller: '[class*="scrollerInner-"]',
  yourMessage: '[class*="message-"][class*="cozyMessage-"]'
};

class DiscordMessageWiper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.processedMessages = new Set();
  }

  async init() {
    console.log('🚀 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false, // Keep visible so you can log in
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    
    // Don't block images - needed for captcha to work properly
    // Discord may present captcha during login which requires images to display

    console.log('🌐 Navigating to Discord...');
    await this.page.goto(DISCORD_URL, { waitUntil: 'networkidle2' });
  }

  async waitForLogin() {
    console.log('\n⏳ Please log in to Discord in the browser window...');
    console.log('   Waiting for you to reach the main Discord interface...\n');
    
    // Try multiple selectors to detect successful login
    const loginSelectors = [
      '[class*="sidebar-"]',           // Sidebar (most reliable)
      '[class*="guilds"]',              // Server list
      '[data-list-id="guildsnav"]',    // Guild navigation
      '[class*="privateChannels-"]',   // DM list
      '[aria-label="Servers"]',        // Servers button
      '[class*="chat-"]'                // Chat area
    ];
    
    console.log('   Trying multiple selectors to detect login...');
    
    let loginDetected = false;
    const startTime = Date.now();
    const timeout = 300000; // 5 minutes
    
    while (!loginDetected && (Date.now() - startTime) < timeout) {
      for (const selector of loginSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            console.log(`   ✓ Found element: ${selector}`);
            loginDetected = true;
            break;
          }
        } catch (err) {
          // Continue trying
        }
      }
      
      if (!loginDetected) {
        await this.page.waitForTimeout(1000); // Wait 1 second before retry
      }
    }
    
    if (!loginDetected) {
      throw new Error('Login timeout - could not detect Discord UI after 5 minutes');
    }
    
    console.log('✅ Login detected! Waiting 3 seconds for UI to stabilize...');
    await this.page.waitForTimeout(3000);
  }

  async navigateToServer(serverUrl) {
    console.log(`🔗 Navigating to: ${serverUrl}`);
    await this.page.goto(serverUrl, { waitUntil: 'networkidle2' });
    await this.page.waitForTimeout(2000);
  }

  async openSearchInServer(serverUrl) {
    console.log(`🔍 Opening search in server...`);
    
    // Navigate to server
    await this.page.goto(serverUrl, { waitUntil: 'networkidle2' });
    await this.page.waitForTimeout(2000);
    
    // Open search with Ctrl+F (Cmd+F on Mac)
    const isMac = process.platform === 'darwin';
    await this.page.keyboard.down(isMac ? 'Meta' : 'Control');
    await this.page.keyboard.press('F');
    await this.page.keyboard.up(isMac ? 'Meta' : 'Control');
    await this.page.waitForTimeout(1000);
    
    return true;
  }

  async searchForUserMessages(username) {
    console.log(`🔎 Searching for messages from: ${username}`);
    
    // Type the search query: "from:username"
    const searchQuery = `from:${username}`;
    await this.page.keyboard.type(searchQuery);
    await this.page.keyboard.press('Enter');
    
    // Wait for search results to load
    console.log('⏳ Waiting for search results...');
    await this.page.waitForTimeout(3000);
    
    return true;
  }

  async processSearchResults(maxMessages = null) {
    console.log('\n🔍 Processing search results...\n');
    
    let totalProcessed = 0;
    let consecutiveNoResults = 0;
    const maxConsecutiveNoResults = 3;

    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |{bar}| {value} messages wiped & deleted',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(maxMessages || 100, 0);

    while (true) {
      // Find search result items (clickable items in search panel)
      const searchResults = await this.page.$$('[class*="searchResult-"]');

      if (searchResults.length === 0) {
        consecutiveNoResults++;
        if (consecutiveNoResults >= maxConsecutiveNoResults) {
          console.log('\n✅ No more search results found. Stopping...');
          break;
        }
        
        // Scroll search panel to load more results
        await this.page.evaluate(() => {
          const resultsPanel = document.querySelector('[class*="searchResultsWrap-"]');
          if (resultsPanel) {
            resultsPanel.scrollTop = resultsPanel.scrollHeight;
          }
        });
        await this.page.waitForTimeout(2000);
        continue;
      }

      consecutiveNoResults = 0;

      // Process first search result
      const firstResult = searchResults[0];
      
      try {
        // Click the search result to jump to the message
        await firstResult.click();
        await this.page.waitForTimeout(1500); // Wait for navigation to message
        
        // Now find and process the message in the channel
        const messages = await this.findUserMessages();
        
        if (messages.length > 0) {
          // Process the first visible message (should be the one we jumped to)
          const { element, id } = messages[0];
          const success = await this.wipeAndDeleteMessage(element, id);
          
          if (success) {
            totalProcessed++;
            progressBar.update(totalProcessed);
            
            if (maxMessages && totalProcessed >= maxMessages) {
              progressBar.stop();
              console.log(`\n✅ Reached limit of ${maxMessages} messages.`);
              return totalProcessed;
            }
          }
        }
        
        // Go back to search (Ctrl/Cmd+F)
        const isMac = process.platform === 'darwin';
        await this.page.keyboard.down(isMac ? 'Meta' : 'Control');
        await this.page.keyboard.press('F');
        await this.page.keyboard.up(isMac ? 'Meta' : 'Control');
        await this.page.waitForTimeout(1000);
        
      } catch (err) {
        console.error(`❌ Error processing search result:`, err.message);
        // Continue to next result
      }
    }

    progressBar.stop();
    return totalProcessed;
  }

  async findUserMessages() {
    // Find all message elements
    const messages = await this.page.$$('[class*="message-"]');
    const userMessages = [];

    for (const message of messages) {
      try {
        // Check if this is your message (has edit/delete options)
        const hasActions = await message.$('[class*="buttonContainer-"]');
        if (hasActions) {
          const messageId = await message.evaluate(el => el.id);
          if (!this.processedMessages.has(messageId)) {
            userMessages.push({ element: message, id: messageId });
          }
        }
      } catch (err) {
        // Skip messages that can't be processed
        continue;
      }
    }

    return userMessages;
  }

  async wipeAndDeleteMessage(messageElement, messageId) {
    try {
      // Hover over message to show actions
      await messageElement.hover();
      await this.page.waitForTimeout(500);

      // Click "More" button (three dots)
      const moreButton = await messageElement.$(SELECTORS.moreButton);
      if (!moreButton) {
        return false;
      }
      await moreButton.click();
      await this.page.waitForTimeout(300);

      // Click "Edit" button
      const editButton = await this.page.$(SELECTORS.editButton);
      if (editButton) {
        await editButton.click();
        await this.page.waitForTimeout(500);

        // Clear the message and type a single space
        const textArea = await this.page.$(SELECTORS.textArea);
        if (textArea) {
          await textArea.click({ clickCount: 3 }); // Select all
          await textArea.type(' '); // Replace with space
          await this.page.keyboard.press('Enter'); // Save edit
          await this.page.waitForTimeout(1000); // Wait for edit to save
        }
      }

      // Now delete the message
      await messageElement.hover();
      await this.page.waitForTimeout(500);

      const moreButton2 = await messageElement.$(SELECTORS.moreButton);
      if (moreButton2) {
        await moreButton2.click();
        await this.page.waitForTimeout(300);

        const deleteButton = await this.page.$(SELECTORS.deleteButton);
        if (deleteButton) {
          await deleteButton.click();
          await this.page.waitForTimeout(500);

          // Confirm deletion
          const confirmButton = await this.page.$(SELECTORS.confirmDelete);
          if (confirmButton) {
            await confirmButton.click();
            await this.page.waitForTimeout(1000);
            
            this.processedMessages.add(messageId);
            return true;
          }
        }
      }

      return false;
    } catch (err) {
      console.error(`❌ Error processing message ${messageId}:`, err.message);
      return false;
    }
  }

  async scrollUp() {
    // Scroll up to load older messages
    await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner-"]');
      if (scroller) {
        scroller.scrollTop = 0;
      }
    });
    await this.page.waitForTimeout(2000); // Wait for messages to load
  }

  async processChannel(maxMessages = null) {
    console.log('\n🔍 Scanning for your messages...\n');
    
    let totalProcessed = 0;
    let consecutiveNoMessages = 0;
    const maxConsecutiveNoMessages = 3;

    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |{bar}| {value}/{total} messages wiped & deleted',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    if (maxMessages) {
      progressBar.start(maxMessages, 0);
    }

    while (true) {
      // Find messages
      const messages = await this.findUserMessages();

      if (messages.length === 0) {
        consecutiveNoMessages++;
        if (consecutiveNoMessages >= maxConsecutiveNoMessages) {
          console.log('\n✅ No more messages found. Stopping...');
          break;
        }
        
        // Scroll up and try again
        await this.scrollUp();
        continue;
      }

      consecutiveNoMessages = 0; // Reset counter

      // Process each message
      for (const { element, id } of messages) {
        const success = await this.wipeAndDeleteMessage(element, id);
        if (success) {
          totalProcessed++;
          if (maxMessages) {
            progressBar.update(totalProcessed);
            if (totalProcessed >= maxMessages) {
              progressBar.stop();
              console.log(`\n✅ Reached limit of ${maxMessages} messages.`);
              return totalProcessed;
            }
          }
        }
      }

      // Scroll up to find more messages
      await this.scrollUp();
    }

    if (maxMessages) {
      progressBar.stop();
    }

    return totalProcessed;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
(async () => {
  // Parse CLI arguments
  const argv = yargs(hideBin(process.argv))
    .option('auto', {
      alias: 'y',
      type: 'boolean',
      description: 'Skip all prompts and run automatically',
      default: false
    })
    .option('channel', {
      alias: 'c',
      type: 'string',
      description: 'Discord channel URL to process',
      default: ''
    })
    .option('server', {
      alias: 's',
      type: 'string',
      description: 'Discord server URL to search all messages',
      default: ''
    })
    .option('username', {
      alias: 'u',
      type: 'string',
      description: 'Discord username for search (required with --server)',
      default: ''
    })
    .option('limit', {
      alias: 'l',
      type: 'number',
      description: 'Maximum messages to delete (0 for unlimited)',
      default: 0
    })
    .option('keep-open', {
      alias: 'k',
      type: 'boolean',
      description: 'Keep browser open after completion',
      default: false
    })
    .help()
    .alias('help', 'h')
    .example('$0 --auto', 'Delete all messages without prompts')
    .example('$0 --auto --limit 100', 'Delete first 100 messages')
    .example('$0 --auto --channel "https://discord.com/channels/..."', 'Delete messages in specific channel')
    .example('$0 --auto --server "https://discord.com/channels/..." --username "yourname"', 'Delete all messages in server via search')
    .argv;

  const wiper = new DiscordMessageWiper();

  try {
    await wiper.init();
    await wiper.waitForLogin();

    let channelUrl = argv.channel;
    let serverUrl = argv.server;
    let username = argv.username;
    let limit = argv.limit;
    let confirmed = argv.auto;
    let useSearch = false;

    // Interactive mode (prompts)
    if (!argv.auto) {
      // Prompt for mode selection
      const modeResponse = await prompts({
        type: 'select',
        name: 'mode',
        message: 'Select purge mode:',
        choices: [
          { title: 'Single Channel (iterate through messages)', value: 'channel' },
          { title: 'Server Search (find all your messages via search)', value: 'search' }
        ],
        initial: 1
      });

      useSearch = modeResponse.mode === 'search';

      if (useSearch) {
        // Prompt for server URL
        const serverResponse = await prompts({
          type: 'text',
          name: 'serverUrl',
          message: 'Enter Discord server URL (any channel in the server):',
        });
        serverUrl = serverResponse.serverUrl;

        // Prompt for username
        const usernameResponse = await prompts({
          type: 'text',
          name: 'username',
          message: 'Enter your Discord username (for search query):',
        });
        username = usernameResponse.username;
      } else {
        // Prompt for channel URL
        const response = await prompts({
          type: 'text',
          name: 'channelUrl',
          message: 'Enter Discord channel URL (or press Enter to use current page):',
          initial: ''
        });
        channelUrl = response.channelUrl;
      }

      // Ask for message limit
      const limitResponse = await prompts({
        type: 'number',
        name: 'limit',
        message: 'Max messages to delete (0 for unlimited):',
        initial: 0
      });

      limit = limitResponse.limit;

      // Confirm before starting
      const confirmResponse = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: '⚠️  This will WIPE and DELETE your messages. Continue?',
        initial: false
      });

      confirmed = confirmResponse.confirm;
    } else {
      // Auto mode - determine if using search mode
      useSearch = Boolean(serverUrl && username);
      
      console.log('🤖 Running in AUTO mode (non-interactive)');
      if (useSearch) {
        console.log(`   Mode: Server Search`);
        console.log(`   Server: ${serverUrl}`);
        console.log(`   Username: ${username}`);
      } else {
        console.log(`   Mode: Channel Iteration`);
        console.log(`   Channel: ${channelUrl || 'current page'}`);
      }
      console.log(`   Limit: ${limit === 0 ? 'unlimited' : limit}`);
      console.log('   ⚠️  Starting in 3 seconds...\n');
      await wiper.page.waitForTimeout(3000);
    }

    if (!confirmed) {
      console.log('❌ Cancelled.');
      await wiper.cleanup();
      return;
    }

    let total = 0;
    const finalLimit = limit > 0 ? limit : null;

    if (useSearch) {
      // Validate required parameters
      if (!serverUrl || !username) {
        console.error('❌ Error: --server and --username are required for search mode');
        await wiper.cleanup();
        process.exit(1);
      }

      // Search-based mode
      await wiper.openSearchInServer(serverUrl);
      await wiper.searchForUserMessages(username);
      total = await wiper.processSearchResults(finalLimit);
    } else {
      // Channel iteration mode
      if (channelUrl && channelUrl.trim()) {
        await wiper.navigateToServer(channelUrl.trim());
      }
      total = await wiper.processChannel(finalLimit);
    }
    
    console.log(`\n✅ Complete! Processed ${total} messages.`);
    
    if (argv.keepOpen) {
      console.log('🔒 Browser will remain open (use --no-keep-open to auto-close)...\n');
    } else {
      console.log('🔒 Browser will close in 5 seconds...\n');
      await wiper.page.waitForTimeout(5000);
      await wiper.cleanup();
    }

  } catch (err) {
    console.error('❌ Error:', err);
    await wiper.cleanup();
    process.exit(1);
  }
})();
