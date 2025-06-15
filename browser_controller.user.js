// ==UserScript==
// @name         AGA Browser-Side Controller
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Extracts AGA:: commands from Gemini's output after network events. Uses GM_log only.
// @author       AGA Developer
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    const COMMAND_PREFIX = "AGA::";
    const AGENT_URL = "http://localhost:3000/command";

    // --- Network Interception URL Prefixes ---
    const STREAM_GENERATE_URL_PREFIX = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
    const REGENERATE_ICON_URL_PREFIX = "https://www.gstatic.com/lamda/images/regenerate";

    // --- Constants for DOM Scraping Logic (from v0.5) ---
    const AGA_POTENTIAL_COMMAND_EVENT = "AgaPotentialCommandEvent"; // Custom event name
    const MESSAGE_CONTENT_SELECTOR = "message-content"; // Selector from v0.5 (user to ensure it's correct, e.g. ".message-content")

    // --- State variable for network flow ---
    let isWaitingForRegenerateIconResponse = false;

    GM_log("AGA Controller: Script loaded (v1.5 - GM_log Only. Agent URL: " + AGENT_URL + ").");

    // --- Unified Agent Communication Function ---
    function sendCommandToAgent(commandTextOrSystemSignal) {
        if (!commandTextOrSystemSignal || typeof commandTextOrSystemSignal !== 'string' || commandTextOrSystemSignal.trim() === '') {
            GM_log("AGA Controller: Invalid command/signal provided to sendCommandToAgent.");
            return;
        }
        GM_log(`AGA Controller: Sending to Agent (${AGENT_URL}): ${commandTextOrSystemSignal}`);
        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ command: commandTextOrSystemSignal }), // Consistent payload structure
            onload: function(response) {
                try {
                    const responseData = JSON.parse(response.responseText);
                    GM_log("AGA Controller: Agent responded: " + JSON.stringify(responseData));
                } catch (e) {
                    GM_log(`AGA Controller: Error parsing Agent response: ${e}. Text: ${response.responseText}`);
                }
            },
            onerror: function(response) {
                GM_log(`AGA Controller: Error sending to Agent. Status: ${response.status}`);
            }
        });
    }

    // --- DOM Scraping Command Logic (from v0.5) ---
    function checkForCommandsInTextAndSend(text) {
        if (!text || typeof text !== 'string' || !text.includes(COMMAND_PREFIX)) {
            return;
        }
        const regex = new RegExp(COMMAND_PREFIX + "([^\\n]+)", "g");
        let match;
        while ((match = regex.exec(text)) !== null) {
            const command = match[1].trim();
            if (command) {
                sendCommandToAgent(command); // Send extracted command
            }
        }
    }

    function handlePotentialCommandEvent(event) {
        if (!event || !event.detail || typeof event.detail.text !== 'string') {
            GM_log(`AGA Controller: Invalid ${AGA_POTENTIAL_COMMAND_EVENT}.`);
            return;
        }
        GM_log(`AGA Controller: Received ${AGA_POTENTIAL_COMMAND_EVENT} with text: "${event.detail.text.substring(0,100)}..."`);
        checkForCommandsInTextAndSend(event.detail.text);
    }

    document.addEventListener(AGA_POTENTIAL_COMMAND_EVENT, handlePotentialCommandEvent);

    // --- Network Interception Utility Functions ---
    const isTargetStreamGenerateUrl = (url) => {
        if (!url) return false;
        const absoluteUrl = url.startsWith('/') ? window.location.origin + url : url;
        return absoluteUrl.startsWith(STREAM_GENERATE_URL_PREFIX);
    };

    const isTargetRegenerateIconUrl = (url) => {
        if (!url) return false;
        return url.startsWith(REGENERATE_ICON_URL_PREFIX);
    };

    // --- Network Interception Handlers ---
    function handleStreamGeneratePostOutcome(isSuccess, status, interceptionType, url) {
        if (!isSuccess) {
            GM_log(`AGA Controller: ${interceptionType} StreamGenerate POST not successful. Status: ${status}. URL: ${url}.`);
            return;
        }
        GM_log(`AGA Controller: ${interceptionType} StreamGenerate POST successful. Waiting for RegenerateIcon. URL: ${url}`);
        isWaitingForRegenerateIconResponse = true;
    }

    function handleRegenerateIconGet(interceptedUrl, interceptionType) {
        GM_log(`AGA Controller: Intercepted ${interceptionType} GET to RegenerateIcon: ${interceptedUrl}. Waiting: ${isWaitingForRegenerateIconResponse}`);
        if (!isWaitingForRegenerateIconResponse) {
            GM_log(`AGA Controller: RegenerateIcon GET, but not waiting. Ignoring.`);
            return;
        }

        GM_log(`AGA Controller: RegenerateIcon GET while waiting. Processing.`);

        // Perform DOM scraping and event dispatch
        const messageElements = document.querySelectorAll(MESSAGE_CONTENT_SELECTOR);
        if (messageElements.length === 0) {
            GM_log(`AGA Controller: RegenerateIcon trigger, but no <${MESSAGE_CONTENT_SELECTOR}> elements found.`);
        } else {
            const lastMessageElement = messageElements[messageElements.length - 1];
            const messageText = lastMessageElement.textContent || "";
            let logText = messageText;
            if (messageText.length > 100) {
                logText = messageText.substring(0, 100) + "...";
            }
            GM_log(`AGA Controller: Text from <${MESSAGE_CONTENT_SELECTOR}>: "${logText}"`);
            document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: messageText } }));
        }

        isWaitingForRegenerateIconResponse = false; // Reset state
        GM_log(`AGA Controller: Reset isWaitingForRegenerateIconResponse.`);
    }

    // --- Network Interception Overrides ---
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._aga_method = method;
        this._aga_url = url;
        return originalXhrOpen.apply(this, arguments);
    };

    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        const method = xhr._aga_method;
        const url = xhr._aga_url;

        if (method === 'POST' && isTargetStreamGenerateUrl(url)) {
            GM_log(`AGA Controller: XHR StreamGenerate POST: ${url}`);
            const originalOnLoad = xhr.onload;
            xhr.onload = function() {
                handleStreamGeneratePostOutcome(xhr.status === 200, xhr.status, "XHR", url);
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        } else if (method === 'GET' && isTargetRegenerateIconUrl(url)) {
             const originalOnLoad = xhr.onload;
             xhr.onload = function() {
                if (xhr.status === 200) {
                    handleRegenerateIconGet(url, "XHR");
                } else {
                    GM_log(`AGA Controller: XHR RegenerateIcon GET to ${url} not successful (Status: ${xhr.status}).`);
                    if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        }
        return originalXhrSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input.url;
        const requestMethod = init?.method?.toUpperCase() || (typeof input === 'object' && input.method?.toUpperCase()) || 'GET';

        if (requestMethod === 'POST' && isTargetStreamGenerateUrl(requestUrl)) {
            GM_log(`AGA Controller: Fetch StreamGenerate POST: ${requestUrl}`);
            try {
                const response = await originalFetch(input, init);
                handleStreamGeneratePostOutcome(response.ok, response.status, "Fetch", requestUrl);
                return response;
            } catch (error) {
                GM_log(`AGA Controller: Fetch StreamGenerate POST error: ${error}. URL: ${requestUrl}`);
                throw error;
            }
        } else if (requestMethod === 'GET' && isTargetRegenerateIconUrl(requestUrl)) {
            GM_log(`AGA Controller: Fetch RegenerateIcon GET: ${requestUrl}`);
            try {
                const response = await originalFetch(input, init);
                if (response.ok) {
                    handleRegenerateIconGet(requestUrl, "Fetch");
                } else {
                     GM_log(`AGA Controller: Fetch RegenerateIcon GET to ${requestUrl} not successful (Status: ${response.status}).`);
                     if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                return response;
            } catch (error) {
                GM_log(`AGA Controller: Fetch RegenerateIcon GET error: ${error}. URL: ${requestUrl}`);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        }
        return originalFetch(input, init);
    };

    // --- Initialization ---
    GM_log("AGA Controller (v1.5): Network interceptors initialized. Agent URL: " + AGENT_URL);

})();