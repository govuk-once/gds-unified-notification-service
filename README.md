## About The Project

GDS Unified Notification Service

This service is a notification system that will be used by multiple services within government.
Notifications will be sent to the GOV.UK to either a user or a group of users.
This service is ran with AWS using serverless architecture.

### Built With

- Node.js v24.11.1 (LTS) & NPM v11.6 - Recommending use of [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm)
- Terraform v1.14.1 - Recommending use of [tfenv](https://github.com/tfutils/tfenv)

## Installation

1. Ensure you have fnm/nvm and tfenv

2. Clone the repository:

```sh
git clone git@github.com:govuk-once/gds-unified-notification-service.git
```

3. Enable relevant utils

```sh
fnm use # or nvm use
tfenv use
```

4. Install dependencies:

```sh
npm install
```

5. Initialize terraform - relies on gds-cli being already configured

This guided wizard will create a tfstate bucket within AWS based on your developer email, and initialize TF on your behalf.
```sh
eval $(gds-cli aws {name_of_sandbox_or_dev_account} -e --skip-ip-range-checks)
npm run development:sandbox:setup
```

## Contact

Solution Architect: Nathaniel Greenwood
Technical Lead: Damian Pokorski
Developers: Ryan Parker, Toby Fox
