import { logger } from "../logger";

export function parseEnvInteger(envName: string, fallbackValue: number, clamp?: {min:number; max:number}): number {
    const envValue = process.env[envName]; // not known; computed so can't do dot 
    if (!envValue){
        const val = clamp ? Math.min(clamp.max, Math.max(clamp.min, fallbackValue)): fallbackValue;
        logger.warn(`${envName} is not set. Please set it in the environment variables, falling back to ${val} for now.`);
        return val
    }
    const parsed = Number.parseInt(envValue, 10); //parse into decimal
    if (Number.isInteger(parsed)){
        if (clamp){
            return Math.min(clamp.max, Math.max(clamp.min, parsed));
        }

        return parsed;
    }
    logger.warn(`${envName} has an invalid value ${envValue} falling back to ${fallbackValue}`);
    return fallbackValue;
}

