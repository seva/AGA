// ==UserScript==
// @name         AGA Browser-Side Controller
// @namespace    http://tampermonkey.net/
// @version      3.1.5
// @description  Handles commands, including ::browser_code for self-modification via agent-based code injection and Tampermonkey updates.
// @author       AGA Developer
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @connect      localhost
// @downloadURL  http://localhost:3000/browser_controller.user.js
// @updateURL    http://localhost:3000/browser_controller.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Constants and Selectors ---
    const COMMAND_PREFIX = "AGA::";
    const AGENT_URL = "http://localhost:3000/command";
    const AGENT_INJECT_CODE_URL = "http://localhost:3000/inject_code"; // New endpoint
    const BROWSER_CODE_COMMAND = "::browser_code"; // Command name for browser code injection
    // UPDATE THE SCRIPT_URL_FOR_UPDATE CONSTANT
    const SCRIPT_URL_FOR_UPDATE = "http://localhost:3000/browser_controller.user.js";


    // --- Network Interception URL Substrings (for infix matching) ---
    const STREAM_GENERATE_URL_SUBSTRING = "/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
    const REGENERATE_ICON_URL_SUBSTRING = "/lamda/images/regenerate";
    const BATCH_EXECUTE_URL_SUBSTRING = "/BardChatUi/data/batchexecute";

    // --- Constants for DOM Scraping Logic ---
    const AGA_POTENTIAL_COMMAND_EVENT = "AgaPotentialCommandEvent";
    const MESSAGE_CONTENT_SELECTOR = "message-content";

    // --- Selectors for Injecting Agent Response ---
    const GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR = "div.ql-editor";
    const GEMINI_RESPONSE_SEND_BUTTON_SELECTOR = "button.send-button";

    // --- State variable for network flow ---
    let isWaitingForRegenerateIconResponse = false;
    let isCalmDownPeriodActive = false;
    const CALM_DOWN_DURATION_MS = 2000;

    // --- Spinner Elements and Functions ---
    let spinnerElement = null; // Keep a reference to the spinner element

    function createSpinnerElement() {
        const svgNS = "http://www.w3.org/2000/svg";
        const spinnerDiv = document.createElement('div');
        spinnerDiv.setAttribute('id', 'aga-spinner');
        spinnerDiv.style.position = 'fixed';
        spinnerDiv.style.width = '24px';
        spinnerDiv.style.height = '24px';
        spinnerDiv.style.top = '10px';
        spinnerDiv.style.right = '10px';
        spinnerDiv.style.display = 'none';
        spinnerDiv.style.zIndex = '9999';

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.97 16.97l2.83 2.83M2 12h4m14 0h4m-2.83-7.76l-2.83 2.83M4.22 16.97l2.83-2.83');

        svg.appendChild(circle);
        svg.appendChild(path);
        spinnerDiv.appendChild(svg);
        return spinnerDiv;
    }

    function showSpinner() {
        if (!spinnerElement) {
            spinnerElement = createSpinnerElement();
            document.body.appendChild(spinnerElement);
        }
        if (spinnerElement) {
            GM_log("AGA Controller: Showing spinner.");
            spinnerElement.style.display = 'block';
        }
    }

    function hideSpinner() {
        if (spinnerElement) {
            GM_log("AGA Controller: Hiding spinner.");
            spinnerElement.style.display = 'none';
        }
    }
    // --- End of Spinner Functions ---
    
    // --- Placeholder for dynamically injected browser code ---
    // --- INJECTED_BROWSER_CODE_START ---
    // Injected code will appear here.
    // --- INJECTED_BROWSER_CODE_END ---

    GM_log("AGA Controller: Script loaded (v3.1 - Agent-based code injection. Agent URL: " + AGENT_URL + ", Inject URL: " + AGENT_INJECT_CODE_URL + ").");

    // --- Reusable UI Injection Function ---
    async function injectTextAndClickSend(textToInject) {
        const editorElement = document.querySelector(GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
        if (!editorElement) {
            GM_log("AGA Controller: Editor element not found with selector: " + GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
            return;
        }

        GM_log('AGA Controller: Attempting to inject text into editor: "' + String(textToInject).substring(0,100) + '..."');
        // Ensure textToInject is a string, especially if it's an error object.
        editorElement.innerText = String(textToInject);
        await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay

        // Dispatch input events to help frameworks recognize the change
        editorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        editorElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay

        const sendButtonElement = document.querySelector(GEMINI_RESPONSE_SEND_BUTTON_SELECTOR);
        if (!sendButtonElement) {
            GM_log("AGA Controller: Send button not found with selector: " + GEMINI_RESPONSE_SEND_BUTTON_SELECTOR + ". Cannot click send.");
            return;
        }
        
        GM_log('AGA Controller: Send button state before click: disabled=' + sendButtonElement.disabled + ', outerHTML=' + sendButtonElement.outerHTML.substring(0,150));
        GM_log("AGA Controller: Attempting to simulate hover and click send button programmatically.");

        // WAIT before CLICKING
        await new Promise(resolve => setTimeout(resolve, 1000)); // Adjusted wait time

        // Simulate hover
        sendButtonElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 200)); 

        // Simulate click sequence
        sendButtonElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        
        GM_log("AGA Controller: Simulated click sequence complete for injected text.");
    }

    // --- Unified Agent Communication Function ---
    function sendCommandToAgent(commandPayload) {
        // Guard Clause: Validate commandPayload structure
        if (!commandPayload || typeof commandPayload !== 'object' ||
            typeof commandPayload.command !== 'string' || typeof commandPayload.stdin !== 'string') {
            GM_log("AGA Controller: Invalid command payload provided to sendCommandToAgent. Expected {command: string, stdin: string}. Payload: " + JSON.stringify(commandPayload));
            // provide feedback to UI about this internal error too
            injectTextAndClickSend("AGA Internal Error: Invalid payload structure before sending to agent."); 
            return;
        }

        showSpinner(); // Show spinner before sending command
        const dataToSend = JSON.stringify(commandPayload);
        GM_log('AGA Controller: Preparing to send command object to Agent: ' + dataToSend);
        GM_log('AGA Controller: Sending to Agent (' + AGENT_URL + '): ' + dataToSend);

        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_URL,
            headers: { "Content-Type": "application/json" },
            data: dataToSend,
            timeout: 60000,
            onload: async function(response) {
                try {
                    const responseData = JSON.parse(response.responseText);
                    GM_log("AGA Controller: Agent responded: " + JSON.stringify(responseData));
                    const formattedResponse = JSON.stringify(responseData, null, 2);
                    await injectTextAndClickSend(formattedResponse);
                } catch (e) {
                    GM_log('AGA Controller: Error parsing Agent response: ' + e + '. Text: ' + response.responseText);
                    await injectTextAndClickSend("AGA Error: Could not parse response from Local Agent. Raw response: " + response.responseText.substring(0, 200));
                } finally {
                    hideSpinner(); // Hide spinner after operation completes or fails
                }
            },
            onerror: async function(response) { // Make onerror async
                GM_log('AGA Controller: Error sending to Agent. Status: ' + response.status);
                await injectTextAndClickSend("AGA Error: Failed to send command to Local Agent. Status: " + response.status);
                hideSpinner(); // Hide spinner after error handling
            }
        });
    }

    // --- Function to send code to agent for injection ---
    async function sendCodeToAgentForInjection(codeToInject) {
        showSpinner();
        const payload = { code_to_inject: codeToInject };
        GM_log('AGA Controller: Sending code to Agent for injection: ' + JSON.stringify(payload).substring(0, 100) + "...");

        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_INJECT_CODE_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 60000,
            onload: async function(response) {
                hideSpinner();

                // Guard: Check for non-200 HTTP status first (network/server level errors)
                if (response.status !== 200) {
                    GM_log('AGA Controller: Agent /inject_code endpoint returned non-200 status: ' + response.status + '. ResponseText: ' + response.responseText);
                    await injectTextAndClickSend("AGA Error: Code injection failed. Server error status: " + response.status + ". Details: " + response.responseText.substring(0,100));
                    return;
                }

                let responseData;
                try {
                    responseData = JSON.parse(response.responseText);
                } catch (e) {
                    GM_log('AGA Controller: Error parsing Agent response from /inject_code: ' + e + '. Text: ' + response.responseText);
                    await injectTextAndClickSend("AGA Error: Could not parse /inject_code response. Raw: " + response.responseText.substring(0, 200));
                    return; // Guard: Exit on parse error
                }

                GM_log("AGA Controller: Agent responded from /inject_code: " + JSON.stringify(responseData));

                // Guard: Exit if agent signals failure (e.g., markers not found, file issues)
                if (!responseData.success) {
                    await injectTextAndClickSend("AGA Error: Code injection failed. Agent response: " + (responseData.detail || responseData.message || "Unknown error from agent"));
                    return;
                }

                // --- Success Logic (all guards passed) ---
                await injectTextAndClickSend("AGA: Code injection successful. Update initiated in a new tab. Attempting to close update tab and refresh this Gemini tab in 5 seconds...");
                
                GM_log("AGA Controller: Triggering Tampermonkey update by opening: " + SCRIPT_URL_FOR_UPDATE);
                const updateTab = window.open(SCRIPT_URL_FOR_UPDATE, '_blank');
                GM_log("AGA Controller: Update tab opened.");

                setTimeout(async () => { // Made setTimeout callback async for potential await
                    GM_log("AGA Controller: Attempting to close update tab and reload Gemini tab.");
                    if (updateTab) {
                        try {
                            updateTab.close();
                            GM_log("AGA Controller: Attempted to close update tab.");
                        } catch (e) {
                            GM_log("AGA Controller: Error attempting to close update tab: " + e + ". It may need to be closed manually.");
                        }
                    }
                    GM_log("AGA Controller: Reloading Gemini tab to apply script update.");
                    window.location.reload();
                }, 5000); // 5-second delay
            },
            onerror: async function(response) {
                hideSpinner();
                GM_log('AGA Controller: Error sending to Agent for code injection. Status: ' + response.status);
                await injectTextAndClickSend("AGA Error: Failed to send code to Local Agent for injection. Status: " + response.status);
            }
        });
    }


    // --- DOM Scraping Command Logic ---
    async function checkForCommandsInTextAndSend(text) { // Made async
        // Guard Clause: Ensure text is a non-empty string
        if (!text || typeof text !== 'string') {
            return;
        }

        const trimmedText = text.trim();
        const COMMAND_PREFIX_LENGTH = COMMAND_PREFIX.length; // Cache length

        let indices = [];
        let currentIndex = trimmedText.indexOf(COMMAND_PREFIX);
        while (currentIndex !== -1) {
            indices.push(currentIndex);
            currentIndex = trimmedText.indexOf(COMMAND_PREFIX, currentIndex + 1);
        }

        if (indices.length === 0) {
            return; // No AGA:: prefix found
        }

        let firstHeuristicParseError = null;
        let firstHeuristicParseErrorJsonString = "";
        let uiFeedbackMessage = null; // To store the single message for UI feedback

        // Iterate from the last found AGA:: prefix backwards to the first
        for (let i = indices.length - 1; i >= 0; i--) {
            const commandStartIndex = indices[i];
            // The potential JSON string starts after "AGA::" and goes to the end of the trimmedText
            const potentialJsonString = trimmedText.substring(commandStartIndex + COMMAND_PREFIX_LENGTH);
            const trimmedPotentialAttempt = potentialJsonString.trim();
            
            if (!trimmedPotentialAttempt) { // If only whitespace (or empty) after AGA::
                GM_log('AGA Controller: Empty string after AGA:: at index ' + commandStartIndex + '. Skipping.');
                continue; // Try the next earlier AGA:: prefix
            }

            let parsedPayload;
            try {
                parsedPayload = JSON.parse(trimmedPotentialAttempt);
            } catch (e) {
                // Heuristic: Only consider for UI error if it looks like an attempt at a JSON object.
                const isLikelyJson = trimmedPotentialAttempt.startsWith('{') && 
                                    trimmedPotentialAttempt.endsWith('}') && 
                                    (trimmedPotentialAttempt.includes('command') || trimmedPotentialAttempt.includes('browser_code')) && 
                                    trimmedPotentialAttempt.includes(':');

                if (isLikelyJson) {
                    GM_log('AGA Controller: Failed to parse LIKELY JSON object starting after AGA:: at index ' + commandStartIndex + ': "' + trimmedPotentialAttempt.substring(0, 200) + '". Error: ' + e);
                    if (!firstHeuristicParseError) { // Store the first such error encountered
                        firstHeuristicParseError = e;
                        firstHeuristicParseErrorJsonString = trimmedPotentialAttempt;
                    }
                } else {
                    GM_log('AGA Controller: Failed to parse text after AGA:: (at index ' + commandStartIndex + ') as JSON (not an obvious JSON object attempt): '+ trimmedPotentialAttempt.substring(0,200) + '. Error: ' + e);
                }
                continue; // Try the next earlier AGA:: prefix
            }

            // Successfully parsed JSON, now validate structure
            if (!parsedPayload || typeof parsedPayload.command !== 'string') {
                GM_log('AGA Controller: Parsed JSON (from AGA:: at index ' + commandStartIndex + '), but \'command\' field is missing or not a string. Payload: ' + JSON.stringify(parsedPayload) + '. Original: ' + trimmedPotentialAttempt);
                continue; // Try the next earlier AGA:: prefix
            }

            // Handle ::browser_code command specifically
            if (parsedPayload.command === BROWSER_CODE_COMMAND) {
                if (typeof parsedPayload.stdin !== 'string' || !parsedPayload.stdin.trim()) {
                    GM_log('AGA Controller: Parsed JSON for ' + BROWSER_CODE_COMMAND + ', but stdin is missing, not a string, or empty. Payload: ' + JSON.stringify(parsedPayload));
                    showSpinner(); // Show spinner before UI feedback for this error
                    await injectTextAndClickSend("AGA Error: For " + BROWSER_CODE_COMMAND + ", 'stdin' must contain the JavaScript code to inject.");
                    hideSpinner(); // Hide spinner after UI feedback
                    return; // Stop processing, error reported
                }
                GM_log('AGA Controller: Valid ' + BROWSER_CODE_COMMAND + ' command. Sending code to agent for injection.');
                await sendCodeToAgentForInjection(parsedPayload.stdin); // New handling for ::browser_code
                return; // Command handled (sent for injection)
            }


            // For regular commands (not ::browser_code)
            if (parsedPayload.stdin === undefined) {
                parsedPayload.stdin = "";
            } else if (typeof parsedPayload.stdin !== 'string') {
                GM_log('AGA Controller: Parsed JSON (from AGA:: at index ' + commandStartIndex + '), command is valid, but stdin is present and not a string: ' + trimmedPotentialAttempt);
                continue; // Try the next earlier AGA:: prefix
            }

            GM_log('AGA Controller: Valid command payload extracted from AGA:: at index ' + commandStartIndex + ': ' + JSON.stringify(parsedPayload));
            sendCommandToAgent(parsedPayload); // This function handles its own spinner for agent communication
            return; // Command found and sent, stop processing further AGA:: occurrences
        }

        // If the loop completes, no valid command was sent.
        if (firstHeuristicParseError) {
            // No specific stdin error, but a general heuristic parse error was found
            const errorMessage = "AGA Error: Malformed JSON detected in your command.\\nDetails: " + firstHeuristicParseError.message + 
                                 "\\nProblematic JSON string: " + firstHeuristicParseErrorJsonString.substring(0, 100) + 
                                 (firstHeuristicParseErrorJsonString.length > 100 ? "..." : "");
            showSpinner();
            await injectTextAndClickSend(errorMessage);
            hideSpinner();
        }
        // If no command sent and no UI-worthy error stored, function exits silently.
    }

    async function handlePotentialCommandEvent(event) { // Made async
        // Guard Clause: Validate event and event.detail.text
        if (!event || !event.detail || typeof event.detail.text !== 'string') {
            GM_log('AGA Controller: Invalid ' + AGA_POTENTIAL_COMMAND_EVENT + '.');
            return;
        }
        GM_log('AGA Controller: Received ' + AGA_POTENTIAL_COMMAND_EVENT + ' with text: "' + event.detail.text.substring(0,100) + '..."');
        await checkForCommandsInTextAndSend(event.detail.text); // Await if it involves UI feedback for errors
    }

    document.addEventListener(AGA_POTENTIAL_COMMAND_EVENT, handlePotentialCommandEvent);

    // --- Network Interception Utility Functions ---
    const isTargetStreamGenerateUrl = (url) => {
        if (!url) return false;
        return url.includes(STREAM_GENERATE_URL_SUBSTRING);
    };

    const isTargetRegenerateIconUrl = (url) => {
        if (!url) return false;
        return url.includes(REGENERATE_ICON_URL_SUBSTRING);
    };

    const isTargetBatchExecuteUrl = (url) => {
        if (!url) return false;
        return url.includes(BATCH_EXECUTE_URL_SUBSTRING);
    };

    // --- Network Interception Handlers ---
    function handleStreamGeneratePostOutcome(isSuccess, status, interceptionType, url) {
        if (!isSuccess) {
            GM_log('AGA Controller: ' + interceptionType + ' POST not successful. Status: ' + status + '. URL: ' + url + '.');
            return;
        }
        if (isCalmDownPeriodActive) {
            GM_log('AGA Controller: ' + interceptionType + ' POST occurred during calm down period. Ignoring. URL: ' + url);
            return;
        }
        GM_log('AGA Controller: ' + interceptionType + ' POST successful. Waiting for RegenerateIcon. URL: ' + url);
        isWaitingForRegenerateIconResponse = true;
    }

    function handleRegenerateIconGet(interceptedUrl, interceptionType) {
        GM_log('AGA Controller: Intercepted ' + interceptionType + ' GET to RegenerateIcon: ' + interceptedUrl + '. Waiting: ' + isWaitingForRegenerateIconResponse);
        
        if (!isWaitingForRegenerateIconResponse) {
            GM_log('AGA Controller: RegenerateIcon GET, but not waiting. Ignoring.');
            return;
        }

        GM_log('AGA Controller: RegenerateIcon GET while waiting. Processing for commands in DOM.');
        isWaitingForRegenerateIconResponse = false; // Reset state immediately

        const messageElements = document.querySelectorAll(MESSAGE_CONTENT_SELECTOR);
        if (messageElements.length === 0) {
            GM_log('AGA Controller: RegenerateIcon trigger, but no <' + MESSAGE_CONTENT_SELECTOR + '> elements found.');
        } else {
            const lastMessageElement = messageElements[messageElements.length - 1];
            const messageText = lastMessageElement.textContent || "";
            let logText = messageText.substring(0, 100) + (messageText.length > 100 ? "..." : "");
            GM_log('AGA Controller: Text from <' + MESSAGE_CONTENT_SELECTOR + '>: "' + logText + '"');
            document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: messageText } }));
        }

        isCalmDownPeriodActive = true;
        GM_log('AGA Controller: Calm down period activated for ' + CALM_DOWN_DURATION_MS + 'ms.');
        setTimeout(() => {
            isCalmDownPeriodActive = false;
            GM_log("AGA Controller: Calm down period ended.");
        }, CALM_DOWN_DURATION_MS);
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

        if (method === 'POST' && (isTargetStreamGenerateUrl(url) || isTargetBatchExecuteUrl(url))) {
            let requestType = isTargetStreamGenerateUrl(url) ? "StreamGenerate" : "BatchExecute";
            GM_log('AGA Controller: XHR ' + requestType + ' POST: ' + url);
            const originalOnLoad = xhr.onload;
            xhr.onload = function() {
                handleStreamGeneratePostOutcome(xhr.status === 200, xhr.status, 'XHR ' + requestType, url);
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        } else if (method === 'GET' && isTargetRegenerateIconUrl(url)) {
             const originalOnLoad = xhr.onload;
             xhr.onload = function() {
                if (xhr.status === 200) {
                    handleRegenerateIconGet(url, "XHR");
                } else {
                    GM_log('AGA Controller: XHR RegenerateIcon GET to ' + url + ' not successful (Status: ' + xhr.status + ').');
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

        if (requestMethod === 'POST' && (isTargetStreamGenerateUrl(requestUrl) || isTargetBatchExecuteUrl(requestUrl))) {
            let requestType = isTargetStreamGenerateUrl(requestUrl) ? "StreamGenerate" : "BatchExecute";
            GM_log('AGA Controller: Fetch ' + requestType + ' POST: ' + requestUrl);
            try {
                const response = await originalFetch(input, init);
                handleStreamGeneratePostOutcome(response.ok, response.status, 'Fetch ' + requestType, requestUrl);
                return response;
            } catch (error) {
                GM_log('AGA Controller: Fetch ' + requestType + ' POST error: ' + error + '. URL: ' + requestUrl);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        } else if (requestMethod === 'GET' && isTargetRegenerateIconUrl(requestUrl)) {
            GM_log('AGA Controller: Fetch RegenerateIcon GET: ' + requestUrl);
            try {
                const response = await originalFetch(input, init);
                if (response.ok) {
                    handleRegenerateIconGet(requestUrl, "Fetch");
                } else {
                     GM_log('AGA Controller: Fetch RegenerateIcon GET to ' + requestUrl + ' not successful (Status: ' + response.status + ').');
                     if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                return response;
            } catch (error) {
                GM_log('AGA Controller: Fetch RegenerateIcon GET error: ' + error + '. URL: ' + requestUrl);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        }
        return originalFetch(input, init);
    };

    // --- Initialization ---
    GM_log("AGA Controller (v3.1): Network interceptors initialized. Agent URL: " + AGENT_URL + ", Inject URL: " + AGENT_INJECT_CODE_URL);

})();