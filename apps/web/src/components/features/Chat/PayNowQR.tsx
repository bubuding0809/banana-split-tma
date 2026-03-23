import { extractMobileNumber, isValidSgMobile } from "@/utils/paynow";
import { trpc } from "@/utils/trpc";
import { QRCodeSVG } from "qrcode.react";
import { Skeleton } from "@telegram-apps/telegram-ui";

interface PayNowQRProps {
  phoneNumber: string;
  amount: number;
  merchantName: string;
}

/**
 * Renders a PayNow QR code for the given phone number and amount.
 * Fetches the QR string from the server via tRPC.
 * Returns null if the phone number is not a valid SG mobile number.
 */
const PayNowQR = ({ phoneNumber, amount, merchantName }: PayNowQRProps) => {
  if (!isValidSgMobile(phoneNumber)) return null;

  const mobileNumber = extractMobileNumber(phoneNumber);

  const { data, isLoading } = trpc.payment.generatePayNowQR.useQuery({
    mobileNumber,
    amount,
    merchantName: merchantName.slice(0, 25),
    editable: true,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <Skeleton visible className="h-[200px] w-[200px] rounded-lg" />
        <p className="text-center text-sm text-gray-500">
          Generating PayNow QR...
        </p>
      </div>
    );
  }

  if (!data?.qrString) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <QRCodeSVG
        value={data.qrString}
        size={200}
        level="M"
        includeMargin
        aria-label="PayNow QR code"
      />
      <p className="text-center text-sm text-gray-500">
        Scan with any Singapore banking app to pay via PayNow
      </p>
    </div>
  );
};

export default PayNowQR;
