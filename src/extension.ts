import * as vscode from "vscode";
import { activateOverlay } from "./overlay";
import { activateTTS } from "./services/play_voice";
import { registerAudioCommands } from "./services/record_speech";
import { registerVoiceInteractionCommands } from "./copilot-wrapper/voice_pipeline";
import { registerInlineChatCommand } from "./copilot-wrapper/inline_chat";
import { registerRubberDuckCommand } from "./copilot-wrapper/rubber_duck";
import { registerCodeSupportCommands } from "./copilot-wrapper/code_support";
import { WebSocketService } from "./services/websocket_service";
import { activateEncouragement } from "./services/encouragement_service";
import { registerMonitoringCommand } from "./copilot-wrapper/rotting"
import { registerPasteMeCommand } from "./copilot-wrapper/paste_me";
import { activateHealth } from "./copilot-wrapper/health";
import { activateSidebar } from "./sidebar";
import { APIManager } from "./utils/api_manager";
// import { createCheerleaderChatParticipant } from "./copilot-wrapper/chat_participant";

export async function activate(context: vscode.ExtensionContext) {
  // Initialize API Manager first
  const apiManager = APIManager.getInstance(context);
  apiManager.initialize();

  // Try to start the WebSocket server and overlay first
  const webSocketService = WebSocketService.getInstance();
  const serverStarted = await webSocketService.startServer();
  
  if (!serverStarted) {
    vscode.window.showInformationMessage('Another instance of the cheerleader extension is already running');
    return;
  }

  // Start overlay app
  try {
    await activateOverlay(context);
  } catch (e) {
    webSocketService.dispose();
    vscode.window.showErrorMessage(`Failed to start overlay: ${e}`);
    return;
  }

  // Only proceed with other activations if overlay started successfully
  activateSidebar(context);

  // register ai voice commands
  registerVoiceInteractionCommands(context);
  registerInlineChatCommand(context);
  registerRubberDuckCommand(context);
  registerCodeSupportCommands(context);

  // register editor commands
  activateTTS(context);
  registerAudioCommands(context);
  activateEncouragement(context);
  registerPasteMeCommand(context);

  // register utility commands
  activateHealth(context);
  registerMonitoringCommand(context);

  // Register Chat Participant (disabled for now)
  // createCheerleaderChatParticipant(context);

  // Add disposal of WebSocket service
  context.subscriptions.push(
    vscode.Disposable.from({
      dispose: () => {
        const webSocketService = WebSocketService.getInstance();
        webSocketService.dispose();
      }
    })
  );
}

export function deactivate() {
  // We don't need to do anything here since the websocket server will be automatically closed when the extension is deactivated
  // The overlay app will quit when the websocket is closed
}
