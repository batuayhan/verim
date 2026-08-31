import { Box } from '@mui/material';
import { TopNav } from '../components/TopNav';
import { AsistanPanel } from './AsistanPanel';

/** Tam sayfa asistan — çekmecedekiyle aynı konuşmayı gösterir. */
export function AsistanPage() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <AsistanPanel />
      </Box>
    </Box>
  );
}
