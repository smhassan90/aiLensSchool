"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClassFeeFieldsProps = {
  admissionFee: string;
  tuitionFee: string;
  onAdmissionFeeChange: (value: string) => void;
  onTuitionFeeChange: (value: string) => void;
};

export function ClassFeeFields({
  admissionFee,
  tuitionFee,
  onAdmissionFeeChange,
  onTuitionFeeChange,
}: ClassFeeFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="admissionFee">Admission fee (optional)</Label>
        <Input
          id="admissionFee"
          type="number"
          min={0}
          placeholder="0"
          value={admissionFee}
          onChange={(e) => onAdmissionFeeChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tuitionFee">Monthly tuition</Label>
        <Input
          id="tuitionFee"
          type="number"
          min={0}
          placeholder="5500"
          value={tuitionFee}
          onChange={(e) => onTuitionFeeChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Each class can have a different amount. Collect fees uses this as the default bill.
        </p>
      </div>
    </div>
  );
}
