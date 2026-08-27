/**
 * Module config command
 */
import { generateModuleConfig } from '../allure/config-generator.js';

export interface ModuleConfigCommandOptions {
  resultsDir: string;
  configFile: string;
  outputFile: string;
  moduleLabel: string;
}

/**
 * Executes module-config command
 */
export async function runModuleConfig(options: ModuleConfigCommandOptions): Promise<void> {
  await generateModuleConfig(options);
}
