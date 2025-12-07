/**
 * BillLabel - Display bill identifier with optional subject bill
 * 
 * Shows:
 * - "HR 1949" for regular bills
 * - "HRES 123 (regarding HR 456)" for procedural votes with subject bills
 */
export default function BillLabel({ 
  legislationType, 
  legislationNumber, 
  subjectBillType, 
  subjectBillNumber,
  className = ""
}) {
  if (!legislationType || !legislationNumber) {
    return null;
  }

  const mainBill = `${legislationType} ${legislationNumber}`;
  
  // Show subject bill if this is a procedural vote (HRES) with a subject
  const hasSubject = subjectBillType && subjectBillNumber;
  const isProceduralRule = legislationType?.toUpperCase() === 'HRES';
  
  if (isProceduralRule && hasSubject) {
    return (
      <span className={className}>
        {mainBill}
        <span className="text-gray-500 text-xs ml-1">
          (regarding {subjectBillType} {subjectBillNumber})
        </span>
      </span>
    );
  }

  return <span className={className}>{mainBill}</span>;
}
