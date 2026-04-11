# Axios to Pureq Codemod Recipes

When migrating from heavily used `axios` patterns, you can use these IDE Search & Replace regular expressions to quickly convert large swathes of code.

## 1. Instance Creation
**Search (Regex):**
```regex
axios\.create\(\{([^\}]*)\}\)
```
**Replace:**
```regex
createClient({$1})
```

*Note: Ensure to import `createClient` from `pureq` instead of `axios`.*

## 2. Basic GET calls (JSON)
If you exclusively expected JSON in Axios:
**Search:**
```regex
axios\.get\((['"`].+?['"`])\)
```
**Replace:**
```regex
client.getJson($1)
```
If your `axios` instance was already configured:
`axios.get(url) -> await client.getJson(url)` avoids needing `response.data`.

## 3. Axios Interceptors to Middleware
Pureq uses immutable interceptors.
**Search (Axios):**
```javascript
axiosInstance.interceptors.request.use\(\(config\) => \{(.*?)\}\);
```
**Transformation (Manual mapping recommended due to immutability):**
```javascript
client = client.useRequestInterceptor((req) => { $1 });
```

*Reminder: Always capture the return of `use`, `useRequestInterceptor` as `pureq` clients are immutable unlike mutable Axios instances.*
