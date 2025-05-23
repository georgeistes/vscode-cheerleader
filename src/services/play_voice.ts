import * as vscode from "vscode";
import player from "play-sound";
import windowsAudioPlayer from "./play_sound_windows";
import { existsSync } from "fs";
import fs from "fs";
import path from "path";
import { createAudioFileFromText } from "./text_to_speech";
import { WebSocketService } from "./websocket_service";
import { getAudioDuration } from "../utils/audio";

/**
 * "On the second day, George said 'Let there be sound!' and there was sound."
 * -- The Georgeiste Manifesto, Chapter 2, Verse 1
 */
export class SoundPlayer {
  private static audioPlayer = player({});
  private static isPlaying = false;
  static context: vscode.ExtensionContext;

  static initialize(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static async playFile(filePath: string): Promise<void> {
    if (this.isPlaying) {
      console.log("Already playing audio, skipping");
      return;
    }

    if (process.platform !== "win32") {
      return new Promise((resolve, reject) => {
        try {
          this.isPlaying = true;

          if (!existsSync(filePath)) {
            this.isPlaying = false;
            reject(new Error(`Audio file not found: ${filePath}`));
            return;
          }

          const audio = this.audioPlayer.play(filePath, (err) => {
            this.isPlaying = false;
            if (err) {
              console.error("Error playing audio:", err);
              reject(err);
            } else {
              resolve();
            }
          });

          // Handle potential player-specific errors
          if (audio && typeof audio.on === "function") {
            audio.on("error", (err: any) => {
              this.isPlaying = false;
              console.error("Player error:", err);
              reject(err);
            });
          }
        } catch (error) {
          this.isPlaying = false;
          reject(error);
        }
      });
    }
    else {
      // For Windows, use the custom player
      return new Promise((resolve, reject) => {
        try {
          this.isPlaying = true;

          if (!existsSync(filePath)) {
            this.isPlaying = false;
            reject(new Error(`Audio file not found: ${filePath}`));
            return;
          }

          windowsAudioPlayer.play(filePath).then(() => {
            this.isPlaying = false;
            resolve();
          }).catch((err: Error) => {
            this.isPlaying = false;
            console.error("Error playing audio:", err);
            reject(err);
          });
        } catch (error) {
          this.isPlaying = false;
          reject(error);
        }
      });
    }
  }

  static isAudioPlaying(): boolean {
    return this.isPlaying;
  }
}

/**
 * Plays an audio file using the SoundPlayer.
 * @param filePath The path to the audio file.
 * @param displayText Optional text to display during playback.
 * @param customDuration Optional custom duration **in milliseconds**.
 *                     If not provided, the duration will be calculated from the audio file.
 * @note Apologies for the confusion with seconds instead of ms here, it's for simpler manipulation below
 * @returns A promise that resolves when the audio is played.
 */
export const playAudioFromFile = async (
  filePath: string, 
  displayText: string | null = null, 
  customDuration: number | null = null
): Promise<void> => {
  if (!SoundPlayer.context) {
    throw new Error("SoundPlayer not initialized with extension context");
  }
  const webSocketService = WebSocketService.getInstance();
  try {
    const durationMs = customDuration ?? await getAudioDuration(filePath);

    // Start Live2D character's speech animation
    webSocketService.startSpeak(displayText ?? "Speaking...", durationMs);

    await SoundPlayer.playFile(filePath);
  } catch (error) {
    console.error("Audio playback error:", error);
    vscode.window.showErrorMessage(
      `Failed to play audio: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    // Stop Live2D character's speech animation
    webSocketService.stopSpeak();
  }
};

/**
 * Converts text to speech and plays it using the SoundPlayer.
 * @param text The text to convert to speech.
 * @returns A promise that resolves when the audio is played.
 */
export const playTextToSpeech = async (text: string): Promise<void> => {
  if (!SoundPlayer.context) {
    throw new Error("SoundPlayer not initialized with extension context");
  }

  const webSocketService = WebSocketService.getInstance();

  try {
    // Use the extension's storage path for temporary files
    const tempDir = path.join(
      SoundPlayer.context.globalStorageUri.fsPath,
      "audio"
    );

    // Create the directory if it doesn't exist
    if (!existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let filename;

    try {
      // let this function create the audio file because it is either wav or mp3 depending on the provider
      // and we don't want to duplicate the logic here
      filename = await createAudioFileFromText(text, tempDir);
    } catch (error) {
      console.error("Error creating audio file:", error);
      throw new Error("Failed to create audio file");
    }

    if (!filename) {
      throw new Error("Failed to create audio file");
    }
    console.log("Successfully created audio file:", filename);

    const durationMs = await getAudioDuration(filename);

    // Start Live2D character's speech animation
    webSocketService.startSpeak(text, durationMs);

    try {
      // Play the audio file
      await SoundPlayer.playFile(filename);
    } finally {
      // Stop Live2D character's speech animation
      webSocketService.stopSpeak();
    }

    // Clean up the file after playback
    fs.unlink(filename, (err) => {
      if (err) {
        console.error("Error deleting audio file:", err);
      } else {
        console.log("Audio file deleted successfully");
      }
    });
  } catch (error) {
    webSocketService.stopSpeak(); // Ensure animation stops even if there's an error
    console.error("Text-to-speech error:", error);
    vscode.window.showErrorMessage(
      `Failed to play audio: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

export function activateTTS(context: vscode.ExtensionContext) {
  // Initialize SoundPlayer with context
  SoundPlayer.initialize(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("cheerleader.testTTS", async () => {
      try {
        const text = await vscode.window.showInputBox({
          prompt: "Enter text to convert to speech",
          placeHolder: "Type something to hear it spoken",
        });

        if (text) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Converting text to speech...",
              cancellable: false,
            },
            async () => {
              await playTextToSpeech(text);
            }
          );
        }
      } catch (error) {
        console.error("Voice test command error:", error);
        vscode.window.showErrorMessage(
          `Voice test failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );
}
