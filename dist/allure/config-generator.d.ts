export interface ModuleConfigOptions {
    resultsDir: string;
    configFile: string;
    outputFile: string;
    moduleLabel: string;
    environmentLabel?: string;
}
/**
 * Generates module-scoped Allure configuration
 */
export declare function generateModuleConfig(options: ModuleConfigOptions): Promise<void>;
//# sourceMappingURL=config-generator.d.ts.map