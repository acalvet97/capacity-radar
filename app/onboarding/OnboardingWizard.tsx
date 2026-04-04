"use client";

import * as React from "react";
import { Step1WorkspaceName } from "./steps/Step1WorkspaceName";
import { Step2TeamSetup } from "./steps/Step2TeamSetup";
import { Step3LoadWork } from "./steps/Step3LoadWork";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

const STEPS = ["Workspace", "Team", "Work items"] as const;

type Props = {
  teamId: string;
  initialTeamName: string;
  initialMembers: TeamMemberRow[];
  initialBufferHoursPerWeek: number;
  initialWeeklyCapacity: number;
};

export function OnboardingWizard({
  teamId,
  initialTeamName,
  initialMembers,
  initialBufferHoursPerWeek,
  initialWeeklyCapacity,
}: Props) {
  const [step, setStep] = React.useState(1);

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div>
        <div className="flex items-center gap-0">
          {STEPS.map((label, i) => {
            const num = i + 1;
            const isActive = num === step;
            const isDone = num < step;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      isDone
                        ? "bg-foreground text-background"
                        : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="size-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      num
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-px flex-1 mx-3 mb-5 transition-colors ${
                      num < step ? "bg-foreground" : "bg-border"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 1 && (
          <Step1WorkspaceName
            initialName={initialTeamName}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2TeamSetup
            teamId={teamId}
            initialMembers={initialMembers}
            initialBufferHoursPerWeek={initialBufferHoursPerWeek}
            initialWeeklyCapacity={initialWeeklyCapacity}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3LoadWork teamId={teamId} />
        )}
      </div>
    </div>
  );
}
