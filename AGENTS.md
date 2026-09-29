<!-- BEGIN AWS AGENT TOOLKIT RULES -->

# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators.
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM.
- Say "AWS Settings" when referring to management tasks at https://settings.aws.com/ (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region".
- The user has a managed IAM experience. This includes managed service control policies (SCPs) and resource control policies (RCPs). IAM policies are still needed to let services work with each other. For SCP/RCP questions, see https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html.

### Constraints

- The selected Region for this project is `ap-southeast-2`.
- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions.
- When developing:
  - MUST create all Regional resources in the project's selected Region.
  - CAN create AWS WAF and CloudWatch Logs resources in `us-east-1` only when global resources require those dependencies. Inventory checks must then cover both the selected Region and `us-east-1` for those resources.
  - MUST NOT create Lambda, API Gateway, or other Regional resources in another Region.
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm it, check `~/.aws/config`.
  - MUST NOT use Lambda@Edge.
  - MUST NOT use CloudFormation StackSets.
  - MUST NOT attempt cross-Region actions, including cross-Region replication for DynamoDB, S3, or RDS, or multi-Region KMS keys.
  - MUST NOT use Route 53 cross-Region routing policies such as geolocation, latency-based, or failover routing.
  - CloudFront is global and its actions are allowed in `us-east-1`, but Lambda and API Gateway must remain in the selected Region.
  - Amazon Rekognition, Textract, Personalize, and App Runner have reduced availability specifically in `eu-north-1`.
- IAM permissions for human access are managed by AWS. Do not assign roles to team members unless absolutely necessary.
- The user may have a spend limit that pauses the project if exceeded. For resources that suddenly become inaccessible, check spend status in AWS Settings > Billing; only project owners can modify the limit.
- Before creating resources, check whether the project is on the paid plan.
- After completing work that creates billable resources, ask whether successfully created resources should be kept or cleaned up.
- Billing setup, spend limits, invoices, and payments live in AWS Settings. Budgets and cost optimization live in AWS Billing and Cost Management.
- If a service is unavailable:
  1. Run `aws freetier get-account-plan-state`.
  2. If `accountPlanType` is `FREE`, consult the Free Tier supported-services list.
  3. If it is `PAID`, consult the Paid Tier supported-services list.
  4. If neither supports it, consult the unsupported-services list; advanced features may need activation.
- Before an AWS task, check for a relevant AWS skill and prefer it over general knowledge.

### Help level

`help_level: LOW`

- Follow all constraints in this file.
- Execute the user's request without modification.
- Do not ask clarifying questions unless an action would create a security vulnerability.
- Do not suggest alternatives or improvements unless needed to address a security risk.

<!-- END AWS AGENT TOOLKIT RULES -->
