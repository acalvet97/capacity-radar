import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PlanningModelSection() {
  return (
    <Card className="rounded-md max-w-2xl">
      <CardHeader>
        <h2 className="text-base font-semibold">Planning Model</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Current deterministic rules used for capacity and exposure.
        </p>
      </CardHeader>
      <CardContent className="px-6">
        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>
            <span className="text-foreground font-medium">Horizon:</span> 4 weeks
          </li>
          <li>
            <span className="text-foreground font-medium">Distribution:</span> Uniform between start
            and deadline
          </li>
          <li>
            <span className="text-foreground font-medium">Exposure thresholds:</span> Low &lt;80% •
            Medium 80–90% • High &gt;90%
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
