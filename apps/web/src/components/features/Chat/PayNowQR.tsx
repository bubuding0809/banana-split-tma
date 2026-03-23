import { generatePayNowString, isValidSgMobile } from "@/utils/paynow";
import { QRCodeSVG } from "qrcode.react";

interface PayNowQRProps {
  phoneNumber: string;
  amount: number;
  merchantName: string;
}

/**
 * Renders a PayNow QR code for the given phone number and amount.
 * Returns null if the phone number is not a valid SG mobile number.
 */
const PayNowQR = ({ phoneNumber, amount, merchantName }: PayNowQRProps) => {
  if (!isValidSgMobile(phoneNumber)) return null;

  const qrString = generatePayNowString(phoneNumber, amount, merchantName);

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <QRCodeSVG
        value={qrString}
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
