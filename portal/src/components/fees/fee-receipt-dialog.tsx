"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageLoader } from "@/components/layout/page-loader";
import { FeeReceiptSheet, receiptWhatsAppText } from "@/components/fees/fee-receipt";
import { feesService } from "@/services/fees.service";
import { whatsappUrl } from "@/lib/money";

export function FeeReceiptDialog({
  paymentId,
  open,
  onOpenChange,
}: {
  paymentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const receiptQuery = useQuery({
    queryKey: ["fee-receipt", paymentId],
    queryFn: () => feesService.getReceipt(paymentId!),
    enabled: open && Boolean(paymentId),
  });

  const whatsappLink = useMemo(() => {
    const receipt = receiptQuery.data;
    if (!receipt) return "";
    const phone = receipt.parents.find((parent) => parent.phone)?.phone ?? "";
    return phone ? whatsappUrl(phone, receiptWhatsAppText(receipt)) : "";
  }, [receiptQuery.data]);

  const receipt = receiptQuery.data;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onClose={() => onOpenChange(false)} className="max-h-[90vh] overflow-y-auto print:hidden">
          <DialogHeader>
            <DialogTitle>Fee receipt</DialogTitle>
            <DialogDescription>
              {receipt?.receiptNumber
                ? `Receipt ${receipt.receiptNumber}`
                : "Print a copy or send the details to the parent on WhatsApp."}
            </DialogDescription>
          </DialogHeader>
          {receiptQuery.isLoading ? <PageLoader variant="panel" /> : null}
          {receiptQuery.isError ? (
            <p className="text-sm text-destructive">Could not load this receipt. Try again in a moment.</p>
          ) : null}
          {receipt ? (
            <div className="space-y-4">
              <FeeReceiptSheet receipt={receipt} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                {whatsappLink ? (
                  <Button type="button" variant="outline" onClick={() => window.open(whatsappLink, "_blank")}>
                    <MessageCircle className="h-4 w-4" />
                    Send on WhatsApp
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">No parent phone on file for WhatsApp.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {receipt && open ? (
        <div className="hidden print:block">
          <FeeReceiptSheet receipt={receipt} />
        </div>
      ) : null}
    </>
  );
}
