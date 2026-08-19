export interface CodexConfig {
  version: string;
  program: string;
  rules: {
    securityAuditOnPR: boolean;
  };
  reviewSettings: {
    model: string;
    maxDiffLines: number;
  };
}

export interface PRReviewResult {
  approved: boolean;
  score: number;
  summary: string;
  ruleViolations: string[];
  suggestions: string[];
}

export interface IssueTriageResult {
  category: 'bug' | 'feature' | 'documentation' | 'question';
  complexity: 'low' | 'medium' | 'high';
  recommendedLabels: string[];
  hasReproductionSteps: boolean;
  summary: string;
}

export interface SecurityAuditResult {
  passed: boolean;
  riskScore: number;
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    ruleId: string;
    description: string;
    location?: string;
  }>;
}
