## Pipelines

### PRs

The PR pipeline in this repository is defined in [./.github/workflows/pr.yml](./workflows/pr.yml), it consists of the following flow

```mermaid
sequenceDiagram
    alt Setup Steps
      Phase 1->Phase 2: Checkout Code
      Phase 1->Phase 2: Setup Terraform
      Phase 1->Phase 2: Setup Node.js
      Phase 1->Phase 2: Install Dependencies
    end
    alt Static Analysis
      Phase 2-->Phase 3: Validate Typescript
      Phase 2-->Phase 3: Run Lint
      Phase 2-->Phase 3: Terraform naming convention lint
      Phase 2-->Phase 3: Terraform init (no backend)
      Phase 2-->Phase 3: Terraform Formatting
      Phase 2-->Phase 3: Terraform validate
    end
    alt Dynamic Analysis
      Phase 3-->Phase 4: Run Unit tests
      Phase 3-->Phase 4: Create Comment with Test results
      Phase 3-->Phase 4: TF Sec
      Phase 3-->Phase 4: Run SonarQube Scan
    end
```

<details>
  <summary>Step summaries</summary>

- Checkout Code: This step checks out the code from the GitHub repository.

- Setup Terraform: This step sets up Terraform in the checked-out code.

- Setup Node.js: This step sets up the Node.js environment for the repository.

- Install Dependencies: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager).

- Validate Typescript: This step runs a TypeScript validation process to check for errors or warnings in the TypeScript code. This ensures that the code is syntactically correct and free of type-related issues.

- Run Lint: This step runs ESLint, a popular JavaScript linter, to analyze the code and report any syntax errors, styling issues, or other potential problems.

- Terraform naming convention lint: This step runs a custom script or tool (likely using Terraform's built-in formatting features) to enforce consistent naming conventions for Terraform files and resources.

- Terraform init (no backend): As mentioned earlier, this step initializes the Terraform environment without setting up a remote state storage service. This allows Terraform to run in "local" mode, as described above.

- Terraform Formatting: This step reformats the Terraform code according to your team's preferred style and naming conventions. This ensures consistency across your infrastructure-as-code configuration files.

- Terraform validate: This step runs Terraform's built-in validation process to check for errors or warnings in the Terraform configuration files. This helps catch any potential issues with resource definitions, dependencies, or other aspects of the infrastructure-as-code setup.

- Run Unit tests: This step executes unit tests for the code in the repository. These tests verify that individual components or features work as expected and help ensure the overall quality of the codebase.

- Create Comment with Test results: After running the unit tests, this step creates a comment summarizing the test results. This allows reviewers to quickly see whether the code passes or fails its automated testing regimen.

- TF Sec: This step runs Terraform's built-in security scanning and analysis tools (Terraform Security) to identify potential security vulnerabilities in your infrastructure-as-code configuration files.

- Checkov GitHub Action: This step uses Checkov, a popular open-source tool for evaluating cloud infrastructure configurations, to analyze the Terraform code and report on any potential security or compliance issues. The results are likely displayed as a GitHub Action status check.

- Run SonarQube Scan: Finally, this step runs a SonarQube scan to analyze the code for quality and security issues. SonarQube provides detailed reports on code smells, bugs, vulnerabilities, and other metrics to help you maintain high-quality software development practices.
</details>

### Release

The release pipeline in this repository is defined in [./.github/workflows/release.yml](./workflows/release.yml), it consists of the following flow

```mermaid
sequenceDiagram
    alt Semantic Release Steps
      Phase 1->Phase 2: Checkout Code
      Phase 1->Phase 2: Setup Node.js
      Phase 1->Phase 2: Install Dependencies
      Phase 1->Phase 2: Run Semantic Release
      Phase 1->Phase 2: Version
    end
    alt Deployment Steps
      Phase 2-->Phase 3: Checkout Code
      Phase 2-->Phase 3: Show OIDC claims (right before assume)
      Phase 2-->Phase 3: Configure AWS credentials
      Phase 2-->Phase 3: Setup Node.js
      Phase 2-->Phase 3: Install Dependencies
      Phase 2-->Phase 3: Build bundles
      Phase 2-->Phase 3: Setup Terraform
      Phase 2-->Phase 3: Terraform Deploy
    end
```

<details>
  <summary>Step summaries</summary>

- Checkout Code: This step checks out the code from the GitHub repository for the semantic release.

- Setup Node.js: This step sets up the Node.js environment for the repository for the semantic release.

- Install Dependencies: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager) for the semantic release.

- Run Semantic Release: Determines the next semantic version number based on the commit messages and tags the release with the version.

- Version: Outputs the semantic version number to the pipeline console.

- Checkout Code: This step checks out the code from the GitHub repository for the deployment.

- Show OIDC claims: Outputs the OIDC claim before configuring AWS credentials (only used in debugger).

- Configure AWS credentials: Uses the OIDC claim to authenticate to AWS.

- Setup Node.js: This step sets up the Node.js environment for the repository for the deployment.

- Install Dependencies: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager) for the deployment.

- Build bundles: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager) for the deployment.

- Setup Terraform: This step sets up Terraform in the checked-out code.

- Terraform Deploy: This step uses Terraform to deploy the infrastructure to AWS configured using the environment variables.

</details>

### Manually Deployment

The release pipeline in this repository is defined in [./.github/workflows/manual.deploy.yml](./workflows/manual.deploy.yml), it consists of the following flow

```mermaid
sequenceDiagram
    alt Environment Settings
      Phase 1->Phase 2: Choosing Environment
    end
    alt Deployment Steps
      Phase 2->Phase 3: Checkout Code
      Phase 2->Phase 3: Show OIDC claims (right before assume)
      Phase 2->Phase 3: Configure AWS credentials
      Phase 2->Phase 3: Setup Node.js
      Phase 2->Phase 3: Install Dependencies
      Phase 2->Phase 3: Build bundles
      Phase 2->Phase 3: Setup Terraform
      Phase 2->Phase 3: Terraform Deploy
    end
```

<details>
  <summary>Step summaries</summary>

- Choosing Environment: Chooses which environment to deploy the build to.

- Show OIDC claims: Outputs the OIDC claim before configuring AWS credentials (only used in debugger).

- Configure AWS credentials: Uses the OIDC claim to authenticate to AWS.

- Setup Node.js: This step sets up the Node.js environment for the repository.

- Install Dependencies: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager).

- Build bundles: This step installs any dependencies required by the code in the repository, such as package.json files managed by npm (Node Package Manager).

- Setup Terraform: This step sets up Terraform in the checked-out code.

- Terraform Deploy: This step uses Terraform to deploy the infrastructure to AWS configured using the environment variables.

</details>
