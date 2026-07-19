export interface Analysis {
    id: string;
    user_id: string; // Add this
    asset_name: string;
    type: string;
    image: string; // url
    analysis: string;
    created_at: string;
}

export const assetTypes = [
    'קריפטו',
    'חוזים עתידיים',
    'מניות',
    'אופציות',
    'פורקס',
    'אג"חים',
    'סחורות',
    'פני סטוקס'
  ] as const;
  