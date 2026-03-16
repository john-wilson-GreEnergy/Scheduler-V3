import { Wrench, Truck, Car, AlertTriangle, Camera, Plane, ShieldCheck, HeartHandshake, DollarSign, FileCheck, Construction, HardHat, Info } from 'lucide-react';

export const IconComponent = ({ name, className }: { name: string, className?: string }) => {
  switch (name) {
    case 'Wrench': return <Wrench className={className} />;
    case 'Truck': return <Truck className={className} />;
    case 'Car': return <Car className={className} />;
    case 'AlertTriangle': return <AlertTriangle className={className} />;
    case 'Camera': return <Camera className={className} />;
    case 'Plane': return <Plane className={className} />;
    case 'ShieldCheck': return <ShieldCheck className={className} />;
    case 'HeartHandshake': return <HeartHandshake className={className} />;
    case 'DollarSign': return <DollarSign className={className} />;
    case 'FileCheck': return <FileCheck className={className} />;
    case 'Construction': return <Construction className={className} />;
    case 'HardHat': return <HardHat className={className} />;
    default: return <Info className={className} />;
  }
};
