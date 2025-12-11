# Terraform conventions & configurable variables

** Draft / Work in progress **

- Resource naming convention `{project}-{env}-{resourceType}-{identifier}`:
  - Project - `gdsuns`
  - Env - Shorthand name `dev`, `uat`, `stg`, `prod` or developer sandbox id (generated via `npm run developer:sandbox:setup` based off their email)
  - Resource type abbreviation - trying to keep it less than 4 characters if possible
  -

- Terraform conventions:
  - Workspaces should never be used
  - Use modules only for re-useable resources, if the resource is to be used for a singular use case - it should be placed into the root `terraform/notifications` directory
  - Files should ideally be only focusing on a single objective (.e.g setting up API Gateway or SQS Queue)
  - File naming convention should be `{index}.{resourceType}.{additionalLabel}.tf`
    - `{index}` - Is completely optional but allows ordering files within the directory, any `tf` files depending on resoures in other files should be placed afterwards - for example in case of an `apiGateway.tf` and `lambda.apiGatewayAuthorizer.tf` - apiGateway should take precedence - and be placed higher up. This should increase readability while browsing the solution, while having no impact on code itself (as TF concatenated all \*.ft files in directory anyways)
    - `{resourceType}` - Ideally should refer to a resource, and supporting additions - i.e. a lambda could contain an additional `iam` definitions, these could be grouped together within a single file
    - `{additionalLabels}` - If needed, it can be used to separate duplicate resource definitions e.g. `lambda.getHealhcheck.tf`
  - File names should be descriptive where possible i.e. `apiGateway.tf` or `sqs.tf`
  - Avoid unnecessarily long files - and split them appropiately based on the objective
