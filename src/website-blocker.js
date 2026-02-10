import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import {
  formatTime, getShortPhaseLabel, getConfig, LOG_CATEGORIES, REGEX_ESCAPE_PATTERN, REGEX_ESCAPE_PATTERN_KEEP_ASTERISK
} from './helpers.js';
import { isInBreakPhase } from './break-phase-utils.js';
import {
  createProgressListener, setupBrowserListeners, removeBrowserListeners,
  handleBlockerGoBack, startBlockerTimerStatusUpdates,
  createBlockerButtons
} from './shared-blocker-utils.js';

// ============================================
// Website Blocker Module (LeechBlock-Style)
// ============================================

/**
 * Delay (in ms) after page navigation before checking for blocked websites.
 * This allows the URL to be fully updated before checking.
 * @constant {number}
 */
const WEBSITE_BLOCKER_CHECK_DELAY_MS = 100;

/**
 * Delay (in ms) before hiding the blocker overlay after navigation.
 * This ensures the navigation has completed before removing the overlay.
 * @constant {number}
 */
const WEBSITE_BLOCKER_HIDE_DELAY_MS = 100;

/**
 * Cooldown duration (in ms) after "Go Back" button is clicked.
 * During this period, _checkCurrentPage() is skipped to prevent the blocker
 * from re-appearing before navigation completes.
 * Uses 800ms to handle slower page loads and network conditions.
 * @constant {number}
 */
const WEBSITE_BLOCKER_GO_BACK_COOLDOWN_MS = 800;

/**
 * WebsiteBlocker class implements LeechBlock-style website blocking
 * during Pomodoro focus sessions. Supports URL pattern matching with wildcards,
 * exceptions, and keyword-based blocking.
 *
 * Features:
 * - Domain blocking: "youtube.com" - blocks entire domain
 * - Wildcard subdomains: "*.youtube.com" - blocks all subdomains
 * - Path-specific blocking: "youtube.com/watch" - blocks specific paths
 * - Exceptions with + prefix: "+docs.google.com" - allows specific sites
 * - Multiple named rulesets with independent configurations
 */
class WebsiteBlocker {
  constructor() {
    this.config = getConfig();
    this.blockerOverlay = null;
    this.isBlocking = false;
    this.currentlyBlockedReason = null;
    this.tabSelectHandler = null;
    this.pageShowHandler = null;
    this.progressListener = null;
    this._timerStatusInterval = null;
    this.contentObserver = null; // MutationObserver for dynamic page content
    this._contentObserverDebounceTimeout = null; // Debounce timeout for content observer
    this._goBackCooldownActive = false; // Cooldown flag to prevent re-blocking after "Go Back"
    this._goBackCooldownTimeout = null; // Timeout ID for cooldown cleanup
    this.distractionDumpActive = false; // Flag to disable blocking during distraction dump
  }

  /**
   * Initialize the website blocker.
   * Sets up listeners for tab changes and URL navigation.
   */
  init() {
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Website Blocker');
    this._setupListeners();
    // Check immediately in case we're already on a blocked page
    this._checkCurrentPage();
  }

  /**
   * Set up all event listeners for detecting navigation to blocked websites.
   * @private
   */
  _setupListeners() {
    setupBrowserListeners(this, () => this._checkCurrentPage(), WEBSITE_BLOCKER_CHECK_DELAY_MS);
  }

  /**
   * Check if the blocker should be shown based on timer state.
   * BREAK PHASE FIX: Returns false during break phases to allow free browsing
   * DISTRACTION DUMP: Returns false during distraction dump to allow capturing thoughts
   * @returns {boolean} True if timer is active and NOT in break phase or dump
   * @private
   */
  _shouldShowBlocker() {
    // During distraction dump, website blocking is disabled to allow capturing thoughts
    if (this.distractionDumpActive) {
      return false;
    }
    // During break phases, website blocking is disabled to allow free browsing
    if (isInBreakPhase()) {
      return false;
    }
    return window.zenPomodoroApp?.timer?.isActive || false;
  }

  /**
   * Get the current page URL from gBrowser.
   * @returns {string|null} Current URL or null if unavailable
   * @private
   */
  _getCurrentUrl() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined' && gBrowser.currentURI) {
        // eslint-disable-next-line no-undef
        return gBrowser.currentURI.spec;
      }
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Error getting current URL', { error: e.message });
    }
    return null;
  }

  /**
   * Check if a URL is an internal browser page that should be skipped.
   * @param {string} url - URL to check
   * @returns {boolean} True if URL is an internal browser page
   * @private
   */
  _isInternalBrowserPage(url) {
    const internalPrefixes = ['about:', 'chrome:', 'moz-extension:'];
    return internalPrefixes.some((prefix) => url.startsWith(prefix));
  }

  /**
   * Hide blocker if currently showing.
   * @private
   */
  _hideBlockerIfShowing() {
    if (this.isBlocking) this._hideBlocker();
  }

  /**
   * Try to setup content observer for the current page.
   * @private
   */
  _trySetupContentObserver() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
        // eslint-disable-next-line no-undef
        const contentDoc = gBrowser.selectedBrowser.contentDocument;
        if (contentDoc?.body) {
          this._setupContentObserver(contentDoc);
        }
      }
    } catch (e) {
      // Log content access denied errors for debugging
      logger.log(LOG_CATEGORIES.SECURITY, 'Content document access denied', { error: e.message });
    }
  }

  /**
   * Evaluate URL against rulesets and update blocker state.
   * @param {string} url - URL to evaluate
   * @private
   */
  _evaluateUrlAndUpdateBlocker(url) {
    this.config = getConfig();
    const blockResult = this._checkUrlAgainstActiveRulesets(
      url,
      this.config.activeRulesets || ['default'],
      this.config.rulesets || []
    );

    logger.log(LOG_CATEGORIES.SECURITY, 'Website blocker page check', {
      url: url,
      blocked: blockResult.blocked,
      isBlocking: this.isBlocking,
    });

    if (blockResult.blocked) {
      this._showBlocker(blockResult.reason, blockResult.rulesetName);
    } else {
      this._hideBlockerIfShowing();
    }
  }

  /**
   * Check if current page should be blocked.
   * Shows or hides the blocker overlay based on timer state and current URL.
   * Refactored to reduce cyclomatic complexity.
   * @private
   */
  _checkCurrentPage() {
    // Skip check if go-back cooldown is active to prevent re-blocking during navigation
    if (this._goBackCooldownActive) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Page check skipped - go-back cooldown active');
      return;
    }

    // If timer is not active, hide any existing blocker
    if (!this._shouldShowBlocker()) {
      this._hideBlockerIfShowing();
      return;
    }

    const currentUrl = this._getCurrentUrl();
    if (!currentUrl) return;

    // Skip internal browser pages
    if (this._isInternalBrowserPage(currentUrl)) {
      this._hideBlockerIfShowing();
      return;
    }

    // Setup content observer for dynamic pages (keyword checking)
    this._trySetupContentObserver();

    // Evaluate URL against rulesets and update blocker
    this._evaluateUrlAndUpdateBlocker(currentUrl);

    // Schedule a delayed re-check for keyword blocking
    // This handles cases where tab title updates after the initial check
    this._scheduleKeywordRecheck();
  }

  /**
   * Schedule a delayed re-check for keyword blocking.
   * Handles cases where tab title updates after the initial page check.
   * @private
   */
  _scheduleKeywordRecheck() {
    if (!this._hasActiveKeywordRules()) return;

    if (this._keywordRecheckTimeout) {
      clearTimeout(this._keywordRecheckTimeout);
    }
    this._keywordRecheckTimeout = setTimeout(() => {
      if (!this._shouldShowBlocker()) return;
      const url = this._getCurrentUrl();
      if (url && !this._isInternalBrowserPage(url)) {
        this._evaluateUrlAndUpdateBlocker(url);
      }
    }, 500);
  }

  /**
   * Setup content observer for dynamic pages.
   * Re-checks keywords when page content changes significantly.
   *
   * NOTE: Due to browser security restrictions (cross-origin), this observer
   * can only monitor DOM changes for URL-based blocking. Keyword content scanning
   * is limited to tab titles only (see _getPageText). The observer still triggers
   * re-checks which will verify the tab title against keyword rules.
   *
   * Refactored to reduce cyclomatic complexity by extracting helper methods.
   *
   * @param {Document} contentDoc - Content document to observe
   * @private
   */
  _setupContentObserver(contentDoc) {
    this._cleanupExistingObserver();

    if (!contentDoc?.body) return;

    if (!this._hasActiveKeywordRules()) {
      logger.log(
        LOG_CATEGORIES.SECURITY,
        'Skipping content observer - no keyword rules configured'
      );
      return;
    }

    this._createContentObserver(contentDoc);
  }

  /**
   * Clean up any existing content observer and debounce timeout.
   * @private
   */
  _cleanupExistingObserver() {
    if (this.contentObserver) {
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }

    if (this._contentObserverDebounceTimeout) {
      clearTimeout(this._contentObserverDebounceTimeout);
      this._contentObserverDebounceTimeout = null;
    }
  }

  /**
   * Check if any active ruleset has keyword rules configured.
   * @returns {boolean} True if keyword rules exist in active rulesets
   * @private
   */
  _hasActiveKeywordRules() {
    const config = getConfig();
    const activeRulesets = config.activeRulesets || ['default'];
    const rulesets = config.rulesets || [];

    for (const rulesetId of activeRulesets) {
      const ruleset = rulesets.find((r) => r.id === rulesetId);
      if (ruleset?.rules?.some((r) => r.type === 'keyword' && r.pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create and attach a MutationObserver to the content document.
   * @param {Document} contentDoc - Content document to observe
   * @private
   */
  _createContentObserver(contentDoc) {
    this.contentObserver = new MutationObserver(() => {
      // Debounce to avoid excessive checks
      if (this._contentObserverDebounceTimeout) {
        clearTimeout(this._contentObserverDebounceTimeout);
      }
      this._contentObserverDebounceTimeout = setTimeout(() => {
        if (window.zenPomodoroApp?.timer?.isActive) {
          this._checkCurrentPage();
        }
      }, CONTENT_OBSERVER_DEBOUNCE_DELAY_MS);
    });

    this.contentObserver.observe(contentDoc.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * Check URL against all active rulesets.
   * @param {string} url - URL to check
   * @param {string[]} activeRulesets - List of active ruleset IDs
   * @param {Object[]} rulesets - All available rulesets
   * @returns {{blocked: boolean, reason: string|null, rulesetName: string|null}} Block result
   * @private
   */
  _checkUrlAgainstActiveRulesets(url, activeRulesets, rulesets) {
    for (const rulesetId of activeRulesets) {
      const ruleset = rulesets.find((r) => r.id === rulesetId);
      if (!ruleset || !ruleset.enabled) continue;

      const blockResult = this._checkUrlAgainstRuleset(url, ruleset);
      if (blockResult.blocked) {
        return { blocked: true, reason: blockResult.reason, rulesetName: ruleset.name };
      }
    }
    return { blocked: false, reason: null, rulesetName: null };
  }

  /**
   * Check if a pattern is an exception pattern (starts with +).
   * @param {string} pattern - Pattern to check
   * @returns {boolean} True if pattern is an exception
   * @private
   */
  _isExceptionPattern(pattern) {
    return pattern.startsWith('+');
  }

  /**
   * Check if a pattern is a block pattern (not + or ~ prefix).
   * @param {string} pattern - Pattern to check
   * @returns {boolean} True if pattern is a block pattern
   * @private
   */
  _isBlockPattern(pattern) {
    return !pattern.startsWith('+') && !pattern.startsWith('~');
  }

  /**
   * Check if URL matches any exception pattern in the sites list.
   * @param {string} url - URL to check
   * @param {string[]} sites - List of site patterns
   * @returns {boolean} True if URL matches an exception pattern
   * @private
   */
  _urlMatchesException(url, sites) {
    for (const pattern of sites) {
      if (!this._isExceptionPattern(pattern)) continue;

      const exceptionPattern = pattern.substring(1);
      if (this._matchesUrlPattern(url, exceptionPattern)) {
        logger.log(LOG_CATEGORIES.SECURITY, 'URL matches exception pattern', {
          url: url,
          pattern: exceptionPattern,
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Find a blocking pattern that matches the URL.
   * @param {string} url - URL to check
   * @param {string[]} sites - List of site patterns
   * @returns {string|null} Matching block pattern or null
   * @private
   */
  _findBlockingPattern(url, sites) {
    for (const pattern of sites) {
      if (this._isBlockPattern(pattern) && this._matchesUrlPattern(url, pattern)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Check URL against a ruleset (includes keyword checking).
   *
   * PRECEDENCE RULES (allow conditions ALWAYS take precedence over block conditions):
   * 1. Check if URL matches any ALLOW website pattern → if yes, return NOT blocked
   * 2. Check if tab title contains any ALLOW keyword → if yes, return NOT blocked
   * 3. Check if URL matches any BLOCK website pattern → if yes, return blocked
   * 4. Check if tab title contains any BLOCK keyword → if yes, return blocked
   * 5. Otherwise return NOT blocked
   *
   * Example: If youtube.com is blocked but "studying" is an allow keyword,
   * visiting a YouTube page with "studying" in the tab title will NOT be blocked.
   *
   * NOTE: Keyword checking only matches against tab titles due to browser
   * security restrictions that prevent access to page body content.
   *
   * @param {string} url - URL to check
   * @param {Object} ruleset - Ruleset configuration
   * @returns {{blocked: boolean, reason: string|null}} Block result
   * @private
   */
  _checkUrlAgainstRuleset(url, ruleset) {
    const rules = ruleset.rules || [];
    // checkTitleOnly is always effectively true due to browser security restrictions
    // but we keep the setting for backward compatibility with saved configs
    const checkTitleOnly = ruleset.checkTitleOnly !== false;

    // Separate rules by type and condition for precedence checking
    const rulesByCategory = this._categorizeRules(rules);

    // ========================================
    // STEP 1: Check URL allow rules (highest priority)
    // Allow rules ALWAYS take precedence over block rules
    // ========================================
    if (this._urlMatchesAnyRule(url, rulesByCategory.websiteAllow)) {
      logger.log(LOG_CATEGORIES.SECURITY, 'URL allowed by website allow rule', { url: url });
      return { blocked: false, reason: null };
    }

    // Get page title once for all keyword checks (performance optimization)
    // NOTE: Only tab title is accessible due to cross-origin security restrictions
    let pageText = null;
    const getPageTextOnce = () => {
      if (pageText === null) {
        pageText = this._getPageText(checkTitleOnly);
      }
      return pageText;
    };

    // ========================================
    // STEP 2: Check allow keywords (second highest priority)
    // Allow keywords override ALL block conditions
    // ========================================
    const allowKeywordMatch = this._findMatchingKeyword(
      rulesByCategory.keywordAllow,
      getPageTextOnce
    );
    if (allowKeywordMatch) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Page allowed by keyword allow rule', {
        keyword: allowKeywordMatch,
        pageTitle: getPageTextOnce(),
      });
      return { blocked: false, reason: null };
    }

    // ========================================
    // STEP 3: Check URL block rules
    // Only checked after all allow conditions have passed
    // ========================================
    const blockingUrlRule = this._findMatchingUrlRule(url, rulesByCategory.websiteBlock);
    if (blockingUrlRule) {
      return { blocked: true, reason: `URL matches pattern: ${blockingUrlRule.pattern}` };
    }

    // ========================================
    // STEP 4: Check keyword block rules
    // Lowest priority - only blocks if no allow rules matched
    // ========================================
    const blockKeywordMatch = this._findMatchingKeyword(
      rulesByCategory.keywordBlock,
      getPageTextOnce
    );
    if (blockKeywordMatch) {
      return { blocked: true, reason: `Page contains blocked keyword: "${blockKeywordMatch}"` };
    }

    // ========================================
    // STEP 5: Default - not blocked
    // ========================================
    return { blocked: false, reason: null };
  }

  /**
   * Categorize rules into groups by type (website/keyword) and condition (block/allow).
   *
   * This separation enables the precedence logic in _checkUrlAgainstRuleset:
   * - websiteAllow: URL patterns that should NEVER be blocked (highest priority)
   * - keywordAllow: Keywords in tab titles that override all blocks (second priority)
   * - websiteBlock: URL patterns to block (third priority)
   * - keywordBlock: Keywords in tab titles to block (lowest priority)
   *
   * @param {Array} rules - Array of rule objects with {type, condition, pattern}
   * @returns {Object} Categorized rules: {websiteBlock, websiteAllow, keywordBlock, keywordAllow}
   * @private
   */
  _categorizeRules(rules) {
    const filterRules = (type, condition) =>
      rules.filter((r) => r.type === type && r.condition === condition && r.pattern);

    return {
      websiteAllow: filterRules('website', 'allow'),
      keywordAllow: filterRules('keyword', 'allow'),
      websiteBlock: filterRules('website', 'block'),
      keywordBlock: filterRules('keyword', 'block'),
    };
  }

  /**
   * Check if URL matches any rule in the list
   * @param {string} url - URL to check
   * @param {Array} rules - Array of rules to check against
   * @returns {boolean} True if URL matches any rule
   * @private
   */
  _urlMatchesAnyRule(url, rules) {
    return rules.some((rule) => this._matchesUrlPattern(url, rule.pattern));
  }

  /**
   * Find the first URL rule that matches
   * @param {string} url - URL to check
   * @param {Array} rules - Array of rules to check against
   * @returns {Object|null} Matching rule or null
   * @private
   */
  _findMatchingUrlRule(url, rules) {
    return rules.find((rule) => this._matchesUrlPattern(url, rule.pattern)) || null;
  }

  /**
   * Find the first matching keyword in page text
   * @param {Array} rules - Array of keyword rules
   * @param {Function} getPageText - Function to get page text (lazy evaluation)
   * @returns {string|null} Matching keyword or null
   * @private
   */
  _findMatchingKeyword(rules, getPageText) {
    for (const rule of rules) {
      const text = getPageText();
      if (this._keywordMatches(text, rule.pattern)) {
        return rule.pattern;
      }
    }
    return null;
  }

  /**
   * Check if keyword matches in text using word boundary matching
   * to avoid false positives like "king" matching "working"
   * @param {string} text - Page text to search
   * @param {string} keyword - Keyword to find
   * @returns {boolean} True if keyword matches
   * @private
   */
  _keywordMatches(text, keyword) {
    if (!text || !keyword) return false;
    // Use word boundary matching to avoid false positives
    // $& in replacement string refers to the matched character
    const escapedKeyword = keyword.replace(REGEX_ESCAPE_PATTERN, '\\$&');
    const regex = new RegExp('\\b' + escapedKeyword + '\\b', 'i');
    return regex.test(text);
  }

  /**
   * Get the current tab title from available browser sources.
   * Due to cross-origin security restrictions, we cannot access contentDocument.body.
   * Only the tab title is accessible from the browser chrome context.
   * @returns {string} The current tab title, or empty string if unavailable
   * @private
   */
  _getTabTitle() {
    /* eslint-disable no-undef */
    return (
      gBrowser.selectedTab?.label ||
      gBrowser.selectedBrowser?.contentTitle ||
      gBrowser.contentTitle ||
      ''
    );
    /* eslint-enable no-undef */
  }

  // eslint-disable-next-line no-unused-vars
  _getPageText(_titleOnly = true) {
    try {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser === 'undefined') {
        logger.log(LOG_CATEGORIES.SECURITY, 'gBrowser not available for title check');
        return '';
      }

      const title = this._getTabTitle();
      if (title) {
        const maxLen = Constants.MAX_TITLE_LOG_LENGTH;
        const truncatedTitle = title.length > maxLen ? title.substring(0, maxLen) + '...' : title;
        logger.log(LOG_CATEGORIES.SECURITY, 'Page title retrieved for keyword check', {
          title: truncatedTitle,
        });
      }

      return title;
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Failed to get page title', { error: e.message });
      return '';
    }
  }

  /**
   * Normalize a URL pattern by removing protocol and www prefix.
   * @param {string} pattern - Pattern to normalize
   * @returns {string} Normalized pattern
   * @private
   */
  _normalizePattern(pattern) {
    return pattern
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
  }

  /**
   * Check if URL matches a wildcard pattern.
   * @param {string} hostname - URL hostname
   * @param {string} fullUrl - Full URL (hostname + pathname)
   * @param {string} normalizedPattern - Normalized pattern with wildcards
   * @returns {boolean} True if URL matches wildcard pattern
   * @private
   */
  _matchesWildcardPattern(hostname, fullUrl, normalizedPattern) {
    // $& in replacement string refers to the matched character
    const regexPattern = normalizedPattern
      .replace(REGEX_ESCAPE_PATTERN_KEEP_ASTERISK, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp('^' + regexPattern, 'i');
    return regex.test(hostname) || regex.test(fullUrl);
  }

  /**
   * Check if URL matches a simple (non-wildcard) pattern.
   * @param {string} hostname - URL hostname (without www)
   * @param {string} pathname - URL pathname
   * @param {string} normalizedPattern - Normalized pattern
   * @returns {boolean} True if URL matches simple pattern
   * @private
   */
  _matchesSimplePattern(hostname, pathname, normalizedPattern) {
    const normalizedHostname = hostname.replace(/^www\./, '');
    const fullPath = normalizedHostname + pathname;

    return (
      normalizedHostname === normalizedPattern ||
      normalizedHostname.endsWith('.' + normalizedPattern) ||
      fullPath.startsWith(normalizedPattern)
    );
  }

  /**
   * Match URL against pattern (supports wildcards).
   * @param {string} url - URL to check
   * @param {string} pattern - Pattern to match (supports * wildcard)
   * @returns {boolean} True if URL matches pattern
   * @private
   */
  _matchesUrlPattern(url, pattern) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();
      const fullUrl = hostname + pathname;
      const normalizedPattern = this._normalizePattern(pattern);

      // Handle wildcard patterns
      if (normalizedPattern.includes('*')) {
        return this._matchesWildcardPattern(hostname, fullUrl, normalizedPattern);
      }

      // Simple domain/path matching
      return this._matchesSimplePattern(hostname, pathname, normalizedPattern);
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Error matching URL pattern', {
        url: url,
        pattern: pattern,
        error: e.message,
      });
      return false;
    }
  }

  /**
   * Show the blocker overlay.
   * @param {string} reason - Reason for blocking
   * @param {string} rulesetName - Name of the ruleset that triggered the block
   * @private
   */
  _showBlocker(reason, rulesetName) {
    if (this.blockerOverlay) return;

    logger.log(LOG_CATEGORIES.SECURITY, 'Website blocker triggered', {
      reason: reason,
      rulesetName: rulesetName,
    });
    this.isBlocking = true;
    this.currentlyBlockedReason = reason;

    this._createBlockerOverlay(reason, rulesetName);
    document.documentElement.appendChild(this.blockerOverlay);
  }

  /**
   * Create the blocker overlay element with all its content.
   * @param {string} reason - Reason for blocking
   * @param {string} rulesetName - Name of the ruleset that triggered the block
   * @private
   */
  _createBlockerOverlay(reason, rulesetName) {
    this.blockerOverlay = document.createElement('div');
    this.blockerOverlay.id = 'zen-pomodoro-website-blocker';
    this.blockerOverlay.className = 'active';

    // Content container
    const content = document.createElement('div');
    content.id = 'zen-pomodoro-website-blocker-content';

    // Icon (block symbol)
    const icon = document.createElement('div');
    icon.id = 'zen-pomodoro-website-blocker-icon';
    icon.textContent = '🚫';

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Website Blocked';

    // Message - show keyword info if blocked by keyword
    const message = document.createElement('p');
    message.textContent = reason?.includes('keyword')
      ? `Blocked: ${reason}`
      : 'This website is blocked during your focus session.';

    // Ruleset info
    const rulesetInfo = document.createElement('p');
    rulesetInfo.className = 'zen-pomodoro-blocker-ruleset';
    rulesetInfo.textContent = `Ruleset: ${rulesetName}`;

    // Timer status
    const timerStatus = document.createElement('div');
    timerStatus.id = 'zen-pomodoro-website-blocker-timer';
    this._updateTimerStatus(timerStatus);

    // Buttons using shared utility
    const buttons = createBlockerButtons(
      'zen-pomodoro-website-blocker-buttons',
      () => this._handleGoBack(),
      () => this._handleStopTimer()
    );

    content.appendChild(icon);
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(rulesetInfo);
    content.appendChild(timerStatus);
    content.appendChild(buttons);

    this.blockerOverlay.appendChild(content);

    // Set up timer status updates using shared utility
    startBlockerTimerStatusUpdates(this, timerStatus);
  }

  /**
   * Update the timer status display.
   * Delegates to shared utility to reduce code duplication.
   * @param {HTMLElement} statusElement - Element to update
   * @private
   */
  _updateTimerStatus(statusElement) {
    updateBlockerTimerStatus(statusElement);
  }

  /**
   * Start interval to update timer status display.
   * Delegates to shared utility to reduce code duplication.
   * @param {HTMLElement} statusElement - Element to update
   * @private
   */
  _startTimerStatusUpdates(statusElement) {
    startBlockerTimerStatusUpdates(this, statusElement);
  }

  /**
   * Handle the "Go Back" button click.
   * Navigates the user away from the blocked website.
   * Uses shared utility for common navigation logic.
   * Sets a cooldown flag to prevent the blocker from re-appearing
   * before navigation completes.
   * @private
   */
  _handleGoBack() {
    logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Go Back on website blocker');

    // Clear any existing cooldown timeout to handle rapid successive clicks
    if (this._goBackCooldownTimeout) {
      clearTimeout(this._goBackCooldownTimeout);
    }

    // Set cooldown flag to prevent _checkCurrentPage() from re-triggering
    // the blocker while navigation is in progress
    this._goBackCooldownActive = true;

    handleBlockerGoBack(() => this._hideBlocker(), WEBSITE_BLOCKER_HIDE_DELAY_MS);

    // Clear the cooldown flag after navigation should be complete
    this._goBackCooldownTimeout = setTimeout(() => {
      this._goBackCooldownActive = false;
      this._goBackCooldownTimeout = null;
      logger.log(LOG_CATEGORIES.SECURITY, 'Go-back cooldown cleared');
    }, WEBSITE_BLOCKER_GO_BACK_COOLDOWN_MS);
  }

  /**
   * Handle the "Stop Timer" button click.
   * Uses the same security lockout as stopping the timer normally.
   * @private
   */
  _handleStopTimer() {
    logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Stop Timer on website blocker');

    // Use the existing handleStopTimerWithLockout utility function
    // which shows the security lock screen before allowing timer stop
    handleStopTimerWithLockout(() => {
      if (window.zenPomodoroApp) {
        window.zenPomodoroApp.stopTimer();
        // Hide the blocker after timer is stopped
        this._hideBlocker();
      }
    });
  }

  /**
   * Hide the blocker overlay.
   * @private
   */
  _hideBlocker() {
    logger.log(LOG_CATEGORIES.SECURITY, 'Hiding website blocker overlay');
    this.isBlocking = false;
    this.currentlyBlockedReason = null;

    // Clear timer status update interval
    if (this._timerStatusInterval) {
      clearInterval(this._timerStatusInterval);
      this._timerStatusInterval = null;
    }

    // Disconnect content observer
    if (this.contentObserver) {
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }

    if (this.blockerOverlay) {
      this.blockerOverlay.remove();
      this.blockerOverlay = null;
    }
  }

  /**
   * Called when the timer starts.
   * Re-checks if we need to show the blocker.
   */
  onTimerStart() {
    this._checkCurrentPage();
  }

  /**
   * Called when the timer stops.
   * Hides the blocker if it's showing.
   */
  onTimerStop() {
    if (this.isBlocking) {
      this._hideBlocker();
    }
  }

  /**
   * Clean up and destroy the blocker.
   */
  destroy() {
    this._removeGBrowserListeners();
    this._clearIntervals();
    this._disconnectContentObserver();
    this._clearGoBackCooldown();
    this._clearKeywordRecheckTimeout();
    this._removeBlockerOverlay();
    this.isBlocking = false;
  }

  /**
   * Clear the keyword recheck timeout if active.
   * @private
   */
  _clearKeywordRecheckTimeout() {
    if (this._keywordRecheckTimeout) {
      clearTimeout(this._keywordRecheckTimeout);
      this._keywordRecheckTimeout = null;
    }
  }

  /**
   * Clear the go-back cooldown timeout if active.
   * @private
   */
  _clearGoBackCooldown() {
    if (this._goBackCooldownTimeout) {
      clearTimeout(this._goBackCooldownTimeout);
      this._goBackCooldownTimeout = null;
    }
    this._goBackCooldownActive = false;
  }

  /**
   * Disconnect the content observer if active.
   * @private
   */
  _disconnectContentObserver() {
    if (this.contentObserver) {
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }
  }

  /**
   * Remove gBrowser event listeners.
   * @private
   */
  _removeGBrowserListeners() {
    removeBrowserListeners(this);
  }

  /**
   * Clear any active intervals.
   * @private
   */
  _clearIntervals() {
    if (this._timerStatusInterval) {
      clearInterval(this._timerStatusInterval);
      this._timerStatusInterval = null;
    }
  }

  /**
   * Remove the blocker overlay from the DOM.
   * @private
   */
  _removeBlockerOverlay() {
    if (this.blockerOverlay) {
      this.blockerOverlay.remove();
      this.blockerOverlay = null;
    }
  }
}

export default WebsiteBlocker;
