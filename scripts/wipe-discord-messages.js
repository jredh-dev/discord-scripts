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
    .argv;

  const wiper = new DiscordMessageWiper();

  try {
    await wiper.init();
    await wiper.waitForLogin();

    let channelUrl = argv.channel;
    let limit = argv.limit;
    let confirmed = argv.auto;

    // Interactive mode (prompts)
    if (!argv.auto) {
      // Prompt for server/channel URL
      const response = await prompts({
        type: 'text',
        name: 'channelUrl',
        message: 'Enter Discord channel URL (or press Enter to use current page):',
        initial: ''
      });

      channelUrl = response.channelUrl;

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
      console.log('🤖 Running in AUTO mode (non-interactive)');
      console.log(`   Channel: ${channelUrl || 'current page'}`);
      console.log(`   Limit: ${limit === 0 ? 'unlimited' : limit}`);
      console.log('   ⚠️  Starting in 3 seconds...\n');
      await wiper.page.waitForTimeout(3000);
    }

    if (!confirmed) {
      console.log('❌ Cancelled.');
      await wiper.cleanup();
      return;
    }

    // Navigate to channel if provided
    if (channelUrl && channelUrl.trim()) {
      await wiper.navigateToServer(channelUrl.trim());
    }

    // Start processing
    const finalLimit = limit > 0 ? limit : null;
    const total = await wiper.processChannel(finalLimit);
    
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
