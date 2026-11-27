import { EnvVars } from '@infra/cdk/config';
import {
  AccountRecovery,
  CfnUserPool,
  CfnUserPoolUICustomizationAttachment,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { readFileSync } from 'node:fs';

export interface UNSCognitoConstructProps {
  readonly portalBaseUrl: string;
  readonly cssPath: string;
}

export class UNSCognitoConstruct extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly domainBaseUrl: string;
  public readonly signInUrl: string;

  constructor(scope: Construct, config: EnvVars, props: UNSCognitoConstructProps) {
    super(scope, config.utils.constructNamingHelper('portal', 'cognito'));

    this.userPool = new UserPool(this, config.utils.constructNamingHelper('portal', 'userpool'), {
      userPoolName: config.utils.namingHelper('portal', 'userpool'),
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: config.removalPolicy,
      deletionProtection: config.isPersistentEnv,
    });

    // Temporary password validity is not exposed as an L2 prop — set via CloudFormation override
    (this.userPool.node.defaultChild as CfnUserPool).addPropertyOverride(
      'AdminCreateUserConfig.UnusedAccountValidityDays',
      1
    );

    const cognitoDomain = this.userPool.addDomain(config.utils.constructNamingHelper('portal', 'cognitoDomain'), {
      cognitoDomain: {
        domainPrefix: config.utils.namingHelper('portal', 'login'),
      },
    });

    this.userPoolClient = new UserPoolClient(this, config.utils.constructNamingHelper('portal', 'userPoolClient'), {
      userPool: this.userPool,
      userPoolClientName: config.utils.namingHelper('portal', 'client'),
      generateSecret: false,
      authFlows: { userSrp: true },
      // Maps UserNotFoundException → NotAuthorizedException so both return the same generic error
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        callbackUrls: [`${props.portalBaseUrl}/callback`],
        logoutUrls: [`${props.portalBaseUrl}/`],
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
    });

    new CfnUserPoolUICustomizationAttachment(this, config.utils.constructNamingHelper('portal', 'uiCustomization'), {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      css: readFileSync(props.cssPath, 'utf8'),
    });

    this.domainBaseUrl = cognitoDomain.baseUrl();
    this.signInUrl = cognitoDomain.signInUrl(this.userPoolClient, {
      redirectUri: `${props.portalBaseUrl}/callback`,
    });
  }
}
