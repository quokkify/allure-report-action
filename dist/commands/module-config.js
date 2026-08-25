/**
 * Module config command
 */
import { generateModuleConfig } from '../allure/config-generator.js';
/**
 * Executes module-config command
 */
export async function runModuleConfig(options) {
    await generateModuleConfig(options);
}
//# sourceMappingURL=module-config.js.map