import { extractMobileNumber, isValidSgMobile } from "@/utils/paynow";
import { trpc } from "@/utils/trpc";
import { QRCodeCanvas } from "qrcode.react";
import { Skeleton, Button } from "@telegram-apps/telegram-ui";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrImageSrc, setQrImageSrc] = useState<string | null>(null);

  const { data, isLoading } = trpc.payment.generatePayNowQR.useQuery(
    {
      mobileNumber: extractMobileNumber(phoneNumber),
      amount,
      merchantName: merchantName.slice(0, 25),
      editable: true,
    },
    {
      enabled: isValidSgMobile(phoneNumber),
    }
  );

  // Generate the image source from the hidden canvas
  useEffect(() => {
    if (canvasRef.current && data?.qrString) {
      setQrImageSrc(canvasRef.current.toDataURL("image/png"));
    }
  }, [data?.qrString]);

  if (!isValidSgMobile(phoneNumber)) return null;

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

  const handleSave = async () => {
    if (!qrImageSrc) return;

    try {
      // Create a file from the base64 data
      const res = await fetch(qrImageSrc);
      const blob = await res.blob();
      const file = new File([blob], `paynow-${merchantName}.png`, {
        type: "image/png",
      });

      // Try the Web Share API first
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "PayNow QR Code",
        });
        return;
      }
    } catch (error) {
      console.error("Error sharing via Web Share API:", error);
      // Fallback to standard download below
    }

    // Fallback: standard download
    const a = document.createElement("a");
    a.href = qrImageSrc;
    a.download = `paynow-${merchantName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Hidden canvas used solely for generating the image data URL */}
      <div className="hidden">
        <QRCodeCanvas
          value={data.qrString}
          size={500} // Generate at a higher resolution for better quality when saving
          level="M"
          includeMargin
          aria-label="PayNow QR code"
          ref={canvasRef}
        />
      </div>

      {/* Visible image tag that supports native "long press to save" */}
      {qrImageSrc ? (
        <img
          src={qrImageSrc}
          alt="PayNow QR code"
          width={200}
          height={200}
          className="rounded-lg"
        />
      ) : (
        <Skeleton visible className="h-[200px] w-[200px] rounded-lg" />
      )}

      <p className="text-center text-sm text-gray-500">
        Scan with any Singapore banking app to pay via PayNow
      </p>

      {qrImageSrc && (
        <Button
          size="s"
          mode="gray"
          onClick={handleSave}
          before={<Download className="h-4 w-4" />}
        >
          Save QR Code
        </Button>
      )}
    </div>
  );
};

export default PayNowQR;
