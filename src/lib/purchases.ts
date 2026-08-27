// RevenueCat Purchases SDK 封装（IAP：仅「高级会员」身份，年费制）
//
// 设计要点：
//  - 高级会员是纯身份标识，暂无功能权益；app 内以 entitlement `premium` 是否 active 判断。
//  - 权威状态 = Supabase profiles.is_premium（rc-webhook 落库）；本模块只提供即时 UI 反馈。
//  - Expo Go 无法加载原生 SDK（v8 会报错）→ 所有函数 try/catch 降级，isPremium 退化为 profile 字段。
//
// 上线前必须替换 API key：
//  - 当前为 Test Store 的 SDK key（stest_...），与后台 app8233ce453d 对应；
//  - 真实商店连接后，按平台替换（iOS app_store 的 SDK key / Android play_store 的 SDK key）。

import Purchases, { CustomerInfo, CustomerInfoUpdateListener, PurchasesPackage } from 'react-native-purchases';

const REVENUECAT_API_KEY = 'stest_eLwYRfBydxpfFADAlZDcbyWfYAM';

// entitlement 标识：与 RevenueCat 后台 lookup_key 一致
export const PREMIUM_ENTITLEMENT_ID = 'premium';
// 年费 package 的 lookup_key（offering premium 下唯一 package）
export const PREMIUM_YEARLY_PACKAGE_ID = 'premium_yearly';

let sdkAvailable = false;

/**
 * 初始化 SDK；Expo Go / 原生模块缺失时静默降级（返回 false）。
 * 其余函数都依赖此函数，SDK 不可用时一律返回 null/false。
 */
export async function ensurePurchasesConfigured(): Promise<boolean> {
  if (sdkAvailable) return true;
  try {
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    sdkAvailable = true;
    return true;
  } catch (err) {
    console.warn('[purchases] SDK unavailable (Expo Go?) — IAP disabled', err);
    return false;
  }
}

/** 从 CustomerInfo 判断高级会员身份（entitlement active） */
export function isPremiumFromCustomerInfo(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  return Object.keys(info.entitlements.active).includes(PREMIUM_ENTITLEMENT_ID);
}

/**
 * 同步购买身份：登录后 logIn(supabaseUid)（跨设备恢复购买的关键），登出后 logOut。
 */
export async function syncPurchasesIdentity(userId: string | null): Promise<void> {
  if (!(await ensurePurchasesConfigured())) return;
  try {
    if (userId) {
      await Purchases.logIn(userId);
    } else {
      await Purchases.logOut();
    }
  } catch (err) {
    console.warn('[purchases] identity sync failed', err);
  }
}

/**
 * 获取当前高级会员身份（乐观状态：SDK 即时值，权威仍以 profiles.is_premium 为准）。
 */
export async function fetchPremiumStatus(): Promise<boolean> {
  if (!(await ensurePurchasesConfigured())) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return isPremiumFromCustomerInfo(info);
  } catch (err) {
    console.warn('[purchases] getCustomerInfo failed', err);
    return false;
  }
}

/** 获取年费 package（offering current 下的 premium_yearly） */
export async function getPremiumPackage(): Promise<PurchasesPackage | null> {
  if (!(await ensurePurchasesConfigured())) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const pkg =
      offerings.current?.availablePackages.find((p) => p.identifier === PREMIUM_YEARLY_PACKAGE_ID) ??
      offerings.current?.availablePackages[0] ??
      null;
    return pkg;
  } catch (err) {
    console.warn('[purchases] getOfferings failed', err);
    return null;
  }
}

/** 购买年费 package，返回最新 CustomerInfo */
export async function purchasePremiumPackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  if (!(await ensurePurchasesConfigured())) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (err: any) {
    // 用户取消购买等错误不抛给上层（SDK 错误码 USER_CANCELLED）
    console.warn('[purchases] purchase failed', err?.userCancelled ? 'user cancelled' : err);
    return null;
  }
}

/** 恢复购买，返回最新 CustomerInfo */
export async function restorePremiumPurchase(): Promise<CustomerInfo | null> {
  if (!(await ensurePurchasesConfigured())) return null;
  try {
    // v8 的 restorePurchases 直接返回 CustomerInfo（非包裹对象）
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (err) {
    console.warn('[purchases] restore failed', err);
    return null;
  }
}

/**
 * 订阅权益变化回调（购买/恢复/到期自动触发），返回取消订阅函数。
 * 调用方（AuthContext）负责把结果合入 isPremium 状态。
 */
export function addPremiumListener(onUpdate: (isPremium: boolean) => void): () => void {
  // v8 的 addCustomerInfoUpdateListener 返回 void，移除需持引用调
  // removeCustomerInfoUpdateListener（旧写法 sub.remove() 会抛错且不生效）
  const listener: CustomerInfoUpdateListener = (info: CustomerInfo) => {
    onUpdate(isPremiumFromCustomerInfo(info));
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
