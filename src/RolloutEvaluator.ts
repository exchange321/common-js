import { ProjectConfig } from "./ConfigServiceBase";
import * as sha1 from "js-sha1";
import { IConfigCatLogger } from ".";

export interface IRolloutEvaluator {
    Evaluate(config: ProjectConfig, key: string, defaultValue: any, user?: User): any;
}

/** Object for variation evaluation */
export class User {

    constructor(identifier: string, email: string = null, country: string = null, custom = {}) {
        this.identifier = identifier;
        this.email = email;
        this.country = country;
        this.custom = custom;
    }

    /** Unique identifier for the User or Session. e.g. Email address, Primary key, Session Id */
    identifier: string;

    /** Optional parameter for easier targeting rule definitions */
    email?: string;

    /** Optional parameter for easier targeting rule definitions */
    country?: string;

    /** Optional dictionary for custom attributes of the User for advanced targeting rule definitions. e.g. User role, Subscription type */
    custom?: { [key: string]: string } = {};
}

export class RolloutEvaluator implements IRolloutEvaluator {

    private logger: IConfigCatLogger;

    constructor(logger: IConfigCatLogger) {
        this.logger = logger;
    }

    Evaluate(config: ProjectConfig, key: string, defaultValue: any, user?: User): any {

        if (!config || !config.ConfigJSON) {

            this.logger.error("JSONConfig is not present, returning defaultValue");

            return defaultValue;
        }

        if (!config.ConfigJSON[key]) {

            this.logger.error("Unknown key: '" + key + "'");

            return defaultValue;
        }

        let result: any;

        if (user) {

            result = this.EvaluateRules(config.ConfigJSON[key].RolloutRules, user);

            if (result == null) {

                result = this.EvaluateVariations(config.ConfigJSON[key].RolloutPercentageItems, key, user);
            }
        }

        return result == null ? config.ConfigJSON[key].Value : result;
    }

    private EvaluateRules(rolloutRules: any, User: User): any {

        if (rolloutRules && rolloutRules.length > 0) {

            for (let i: number = 0; i < rolloutRules.length; i++) {

                let rule: any = rolloutRules[i];

                let comparisonAttribute: string = this.GetUserAttribute(User, rule.ComparisonAttribute);

                if (!comparisonAttribute) {
                    continue;
                }

                switch (rule.Comparator) {
                    case 0: // in

                        let cvs: string[] = rule.ComparisonValue.split(",");

                        for (let ci: number = 0; ci < cvs.length; ci++) {

                            if (cvs[ci].trim() === comparisonAttribute) {
                                return rule.Value;
                            }
                        }

                        break;

                    case 1: // notIn

                        if (!rule.ComparisonValue.split(",").some(e => {
                            if (e.trim() === comparisonAttribute) {
                                return true;
                            }

                            return false;
                        })) {

                            return rule.Value;
                        }

                        break;

                    case 2: // contains

                        if (comparisonAttribute.search(rule.ComparisonValue) !== -1) {
                            return rule.Value;
                        }

                        break;

                    case 3: // not contains

                        if (comparisonAttribute.search(rule.ComparisonValue) === -1) {
                            return rule.Value;
                        }

                        break;

                    default:
                        break;
                }
            }
        }

        return null;
    }

    private EvaluateVariations(rolloutPercentageItems: any, key: string, User: User, ro?: number): any {

        if (rolloutPercentageItems && rolloutPercentageItems.length > 0) {

            let hashCandidate: string = key + User.identifier;
            let hashValue: any = sha1(hashCandidate).substring(0, 7);
            let hashScale: number = parseInt(hashValue, 16) % 100;
            let bucket: number = 0;

            for (let i: number = 0; i < rolloutPercentageItems.length; i++) {
                const variation: any = rolloutPercentageItems[i];
                bucket += +variation.Percentage;

                if (hashScale < bucket) {
                    return variation.Value;
                }
            }
        }

        return null;
    }

    private GetUserAttribute(User: User, attribute: string): string {
        switch (attribute) {
            case "Identifier":
                return User.identifier;
            case "Email":
                return User.email;
            case "Country":
                return User.country;
            default:
                return (User.custom || {})[attribute];
        }
    }
}