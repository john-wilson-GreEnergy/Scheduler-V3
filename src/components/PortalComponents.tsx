import { Wrench, Truck, Car, AlertTriangle, Camera, Plane, ShieldCheck, HeartHandshake, DollarSign, FileCheck, Construction, HardHat, Info, Link, Megaphone, ClipboardCheck, ExternalLink, Globe, Calendar, User, Settings, Zap } from 'lucide-react';

export const AVAILABLE_ICONS = [
  'Wrench', 'Truck', 'Car', 'AlertTriangle', 'Camera', 'Plane', 'ShieldCheck', 
  'HeartHandshake', 'DollarSign', 'FileCheck', 'Construction', 'HardHat', 
  'Link', 'Megaphone', 'ClipboardCheck', 'ExternalLink', 'Globe', 'Calendar', 
  'User', 'Settings', 'Zap', 'Info'
];

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
    case 'Link': return <Link className={className} />;
    case 'Megaphone': return <Megaphone className={className} />;
    case 'ClipboardCheck': return <ClipboardCheck className={className} />;
    case 'ExternalLink': return <ExternalLink className={className} />;
    case 'Globe': return <Globe className={className} />;
    case 'Calendar': return <Calendar className={className} />;
    case 'User': return <User className={className} />;
    case 'Settings': return <Settings className={className} />;
    case 'Zap': return <Zap className={className} />;
    default: return <Info className={className} />;
  }
};
