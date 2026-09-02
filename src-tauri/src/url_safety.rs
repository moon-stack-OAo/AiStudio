//! URL 硬拦：与前端 `src/core/utils/urlSafety.js` 同目标。
//! 拦截云元数据 / 链路本地 / 明显 SSRF 靶点；不拦 localhost / RFC1918。
//! 当前由 Android `android_media` 下载路径复用；桌面侧主要靠 capabilities deny。

#![allow(dead_code)]

fn normalize_hostname(hostname: &str) -> String {
    hostname
        .trim()
        .trim_matches(|c| c == '[' || c == ']')
        .trim_end_matches('.')
        .to_ascii_lowercase()
}

fn extract_ipv4_mapped(host: &str) -> Option<String> {
    let lower = host.to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("::ffff:") else {
        return None;
    };
    if rest.bytes().filter(|&b| b == b'.').count() == 3
        && rest.split('.').all(|p| !p.is_empty() && p.parse::<u8>().is_ok())
    {
        return Some(rest.to_string());
    }
    let mut parts = rest.split(':');
    let (Some(hi), Some(lo), None) = (parts.next(), parts.next(), parts.next()) else {
        return None;
    };
    let hi = u16::from_str_radix(hi, 16).ok()?;
    let lo = u16::from_str_radix(lo, 16).ok()?;
    Some(format!(
        "{}.{}.{}.{}",
        (hi >> 8) & 0xff,
        hi & 0xff,
        (lo >> 8) & 0xff,
        lo & 0xff
    ))
}

/// 危险 host（硬拦）。不含 127.0.0.1 / RFC1918。
pub fn is_blocked_fetch_host(hostname: &str) -> bool {
    let host = normalize_hostname(hostname);
    if host.is_empty() {
        return true;
    }
    const BLOCKED: &[&str] = &[
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.google",
        "metadata",
        "kubernetes.default",
        "kubernetes.default.svc",
        "fd00:ec2::254",
    ];
    if BLOCKED.contains(&host.as_str()) {
        return true;
    }
    if host.starts_with("169.254.") {
        return true;
    }
    if host == "0.0.0.0" || host == "::" || host == "::1" {
        return true;
    }
    if let Some(mapped) = extract_ipv4_mapped(&host) {
        if mapped == "169.254.169.254" || mapped.starts_with("169.254.") {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_metadata_and_link_local() {
        assert!(is_blocked_fetch_host("169.254.169.254"));
        assert!(is_blocked_fetch_host("169.254.1.1"));
        assert!(is_blocked_fetch_host("metadata.google.internal"));
        assert!(is_blocked_fetch_host("METADATA"));
        assert!(is_blocked_fetch_host("kubernetes.default.svc"));
        assert!(is_blocked_fetch_host("0.0.0.0"));
        assert!(is_blocked_fetch_host("::"));
        assert!(is_blocked_fetch_host("::1"));
        assert!(is_blocked_fetch_host("[::1]"));
        assert!(is_blocked_fetch_host("fd00:ec2::254"));
        assert!(is_blocked_fetch_host("::ffff:169.254.169.254"));
        assert!(is_blocked_fetch_host("::ffff:a9fe:a9fe"));
    }

    #[test]
    fn allows_localhost_and_rfc1918() {
        assert!(!is_blocked_fetch_host("localhost"));
        assert!(!is_blocked_fetch_host("127.0.0.1"));
        assert!(!is_blocked_fetch_host("192.168.1.10"));
        assert!(!is_blocked_fetch_host("10.0.0.1"));
        assert!(!is_blocked_fetch_host("172.16.0.1"));
        assert!(!is_blocked_fetch_host("api.openai.com"));
    }
}
